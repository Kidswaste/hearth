// (round 62, parkjam62) Park jam without a sound card, a mic or the real plugins:
//   1. tools/parkjam-core.js: the output Park mode picks (UA kept / laptop speakers / headphones / no hands-free),
//      safe buffers, battery-friendly controls, WAV read / write, the ambience layered under a loop, the MIDI file,
//      places / weeks / file names, the proof text against Codex's QuestCore.checkProof.
//   2. creative-vstmain.js parkSave: files land in <data>/creative-park/<sketch>/, nothing else is writable.
//   3. the loop recorder in the REAL creative-vst-host.py (pool → host), with dev/fixtures/fake-vst-py standing in for
//      Pedalboard / sounddevice (FAKE_SD_NO_UA: a laptop with no UA interface) / rtmidi: exact loop length, notes kept
//      sample-accurately (a phrase from the host's sequencer), "starts on the first note", cancel, a stop drops a take.
//   node dev/parkjam62-test.js        (part 3 says "skipped" plainly when python3 + numpy are missing)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const P = require('../tools/parkjam-core.js'), L = require('../tools/workbench-vst-live.js'), C = require('../tools/quest-core.js');
const { pool, parkSave, jobOf } = require('../creative-vstmain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(25); } };
const out = { checks: 0, skipped: [], timings: {} }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };

// ---- 1. the pure parts
const laptop = { devices: [{ id: 0, name: 'Microsoft Sound Mapper - Output', api: 'MME' }, { id: 1, name: 'Speakers (Realtek(R) Audio)', api: 'MME', default: true },
  { id: 2, name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI', default: true }, { id: 3, name: 'Headset (WH-1000XM4 Hands-Free AG Audio)', api: 'Windows WASAPI' }], preferred: 2 };
let o = P.parkOutput(laptop); ok(o.value === '2' && o.kind === 'builtin', 'no UA: the laptop speakers on WASAPI shared (not MME, not exclusive)');
o = P.parkOutput({ devices: [...laptop.devices.map(d => ({ ...d, default: false })), { id: 4, name: 'Headset (WH-1000XM4 Hands-Free AG Audio)', api: 'Windows WASAPI', default: true }], preferred: 4 });
ok(o.value === '2', 'never the Bluetooth hands-free profile, even as the default');
o = P.parkOutput({ devices: [{ id: 0, name: 'MacBook Pro Speakers', api: 'Core Audio' }, { id: 1, name: 'External Headphones', api: 'Core Audio', default: true }] });
ok(o.value === '1' && o.kind === 'headphones', 'a Mac: the headphone jack when it is the default');
o = P.parkOutput({ devices: [{ id: 0, name: 'MacBook Pro Speakers', api: 'Core Audio' }, { id: 5, name: 'AirPods Pro', api: 'Core Audio', default: true }] });
ok(o.value === '5' && o.kind === 'bluetooth' && /150–250 ms/.test(o.why), 'AirPods as the default: kept (no speakers out loud in the park), with a latency note');
const ua = { devices: [...laptop.devices, { id: 7, name: 'Universal Audio Thunderbolt', api: 'ASIO' }, { id: 8, name: 'Monitor 1-2 (Universal Audio Thunderbolt WDM)', api: 'Windows WASAPI' }], preferred: 2, asio: true };
o = P.parkOutput(ua); ok(o.value === '7' && o.kind === 'ua', 'the UA connected: Park mode keeps it on ASIO');
ok(P.parkOutput({}).value === '' && P.parkOutput({}).kind === 'system', 'nothing listed: the system output');
ok(P.safeBuffer('Windows WASAPI') === 512 && P.safeBuffer('ASIO') === 256 && P.safeBuffer('ASIO', { battery: false }) === 128 && P.safeBuffer('MME') === 1024 && L.BUFFERS.some(([b]) => b === P.safeBuffer('Core Audio')), 'safe buffers');
let b = P.batterySaver([{ key: 'polyphony', label: 'Polyphony', value: 16, min: 1, max: 32 }, { key: 'oversampling', label: 'Oversampling', value: '4x', choices: ['1x', '2x', '4x'] },
  { key: 'uni', label: 'Unison voices', value: 16, min: 1, max: 16 }, { key: 'pnorm', label: 'Polyphony (0–1)', value: .5, min: 0, max: 1 }, { key: 'hq', label: 'HQ mode', value: true }, { key: 'm1', label: 'Macro voices', value: 9, min: 1, max: 16 }]);
assert.deepEqual(b.values, { polyphony: 8, oversampling: '1x', hq: false }); assert.deepEqual(b.before, { polyphony: 16, oversampling: '4x', hq: true }); out.checks++;
ok(P.batterySaver([{ key: 'polyphony', label: 'Polyphony', value: 4, min: 1, max: 32 }]).changed.length === 0, 'already light: nothing changed');
ok(P.lowestChoice(['Off', '2x', '4x']) === 'Off' && P.lowestChoice(['8x', '2x', '4x']) === '2x', 'the lowest oversampling choice');
ok(Math.abs(P.loopSeconds(4, 120) - 8) < 1e-9 && Math.abs(P.loopSeconds(16, 60) - 64) < 1e-9, 'loop lengths');
assert.deepEqual(P.loopArgs('8 96 bpm now'), { bars: 8, bpm: 96, now: true, ambience: null }); assert.equal(P.loopArgs('16 dry').ambience, false); out.checks++;
const tone = n => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * .5);
const loop = { rate: 48000, channels: [tone(48000), tone(48000)] }, wav = P.encodeWav(loop), back = P.decodeWav(wav);
ok(back.rate === 48000 && back.channels[1].length === 48000 && Math.abs(back.channels[0][123] - loop.channels[0][123]) < 1e-4, 'WAV 16-bit round trip');
ok(Buffer.from(wav.subarray(0, 4)).toString() === 'RIFF' && wav.length === 44 + 48000 * 4, 'a plain RIFF / 16-bit stereo WAV');
const amb = { rate: 44100, channels: [Float32Array.from({ length: 44100 * 2 }, () => .5)] }, mixed = P.layer(loop, amb, { gainDb: -14 });
ok(mixed.channels[0].length === 48000 && Math.abs(mixed.channels[0][24000] - loop.channels[0][24000] - .5 * 10 ** (-14 / 20)) < 1e-3, 'ambience under the loop at −14 dB, resampled to the loop rate');
ok(Math.abs(mixed.channels[0][0] - loop.channels[0][0]) < 1e-6 && Math.abs(mixed.channels[0][47999] - loop.channels[0][47999]) < 1e-3, 'ambience faded at the loop ends (it still loops)');
const shortAmb = { rate: 48000, channels: [Float32Array.from({ length: 4800 }, () => .3)] }, long = P.layer({ rate: 48000, channels: [new Float32Array(48000)] }, shortAmb, { gainDb: 0 });
ok(Math.abs(long.channels[0][30000] - .3) < 1e-6, 'a short ambience loops to fill the loop');
const mid = P.midiFile([{ note: 60, time: 0, length: .5, velocity: 100 }, { note: 64, time: .5, length: .5, velocity: 90 }], { bpm: 120 }), mt = Buffer.from(mid);
ok(mt.subarray(0, 4).toString() === 'MThd' && mt.subarray(14, 18).toString() === 'MTrk' && mt.readUInt16BE(12) === 480 && mt.includes(Buffer.from([0x90, 60, 100])) && mt.includes(Buffer.from([0xff, 0x51, 3, 0x07, 0xa1, 0x20])), 'MIDI file: header, 480 ppq, tempo 120, notes');
ok(P.placeOf('Park sketch · Belleville · 18 Oct') === 'Belleville' && P.placeOf('Untitled workbench') === null && P.placeKey('Buttes-Chaumont') === 'buttes-chaumont' && P.placeKey('Jardin du Luxembourg é') === 'jardin-du-luxembourg-e', 'places');
ok(P.isoWeek(new Date(2026, 9, 18)) === '2026-W42' && P.isoWeek(new Date(2027, 0, 1)) === '2026-W53', 'ISO weeks');
const names = P.takeNames('Buttes-Chaumont', new Date(2026, 9, 18, 15, 4, 9));
ok(names.loop === 'Buttes-Chaumont loop 2026-10-18 15.04.09.wav' && Object.values(names).every(n => /^[\w .·-]{1,80}\.(wav|mid|json)$/.test(n)), 'take file names fit parkSave');
const take = { place: 'Belleville', bars: 4, beats: 4, bpm: 120, seconds: 8, instrument: 'Vital', output: 'Speakers', sketch: 'Park sketch · Belleville · 18 Oct', ambience: true, notes: [{ note: 60, time: 0, length: .2, velocity: 100 }] };
const text = P.proofText(take, P.analyse(loop));
C.checkProof({ type: 'file', title: names.loop, path: '/tmp/x.wav', kind: 'audio/wav', bytes: wav.length, fingerprint: 'a'.repeat(64), images: [], ...text }); out.checks++;
ok(/4 bars of 4 at 120 BPM/.test(text.excerpt) && /C4@0.00s/.test(text.excerpt) && /cannot hear/.test(text.coverage) && JSON.parse(text.analysis).durationSeconds === 1, 'proof text in Codex\'s contract (honest about listening)');

// ---- 2. parkSave + the main side's fields
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-parkjam-'));
try {
  const f = parkSave(temp, 'Park sketch · Belleville · 18 Oct', names.loop, wav);
  ok(f === path.join(temp, 'creative-park', 'Park sketch · Belleville · 18 Oct', names.loop) && fs.readFileSync(f).length === wav.length, 'a take lands in the sketch\'s folder');
  ok(path.dirname(parkSave(temp, '../../etc/passwd', 'x.json', '{}')).startsWith(path.join(temp, 'creative-park')), 'a sketch name can\'t leave the park folder');
  for (const bad of ['../x.wav', 'x.exe', '.hidden.wav', 'a/b.wav']) assert.throws(() => parkSave(temp, 's', bad, wav), /file name/);
  assert.throws(() => parkSave(temp, 's', 'x.wav', new Uint8Array(0)), /Invalid park file/); out.checks += 2;
  const j = jobOf({ action: 'record', plugin: 'x', bars: 8, bpm: 96, beats: 4, wait: 'note', extra: 1 }, 'Vital'); ok(j.bars === 8 && j.bpm === 96 && j.wait === 'note' && !('extra' in j), 'record fields pass the whitelist');
  assert.throws(() => jobOf({ action: 'record', bars: 'all' }), /loop length/); ok(jobOf({ action: 'record', wait: 'later' }).wait === undefined, 'unknown wait dropped');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
out.core = 'parkOutput / buffers / battery controls / WAV / ambience layer / MIDI / places / weeks / names / proof contract / parkSave passed';

// ---- 3. the real host's loop recorder
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('host part: python3 with numpy not found here'); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-parkjam-host-'));
  const root = path.join(dir, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true }); fs.mkdirSync(path.join(root, 'Serum2.vst3'));
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_SD_NO_UA: '1', FAKE_MIDI_NOTE: '0' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  try {
    host = pool({ dataDir: dir, python: PY, roots: [root] }); assert.ok((await host.status()).ok);
    const plugins = host.scan().plugins, vital = plugins.find(p => p.name === 'Vital'), serum = plugins.find(p => p.name === 'Serum 2');
    const V = (action, extra = {}) => host.request({ action, plugin: vital.path, name: 'Vital', ...extra });
    const devices = await V('devices'); ok(devices.ok && !P.hasUA(devices), 'the laptop alone: no UA listed');
    const pick = P.parkOutput(devices), dev = devices.devices.find(d => d.id === L.parse(pick.value).device);
    ok(dev.name === 'Speakers (Realtek(R) Audio)' && dev.api === 'Windows WASAPI' && !L.parse(pick.value).exclusive, 'Park mode picks the built-in speakers, WASAPI shared: ' + pick.why);
    // one instrument: Serum 2 opened too, then solo keeps Vital only
    assert.ok((await host.request({ action: 'open', plugin: serum.path, name: 'Serum 2' })).ok); assert.equal(host.hosts, 1);
    const opened = await V('open', { live: true, ...L.parse(pick.value), buffer: P.safeBuffer(dev.api), gain: .2 }); ok(opened.ok && opened.playing && opened.buffer === 512 && opened.api === 'Windows WASAPI' && !opened.exclusive, 'live on the laptop speakers at 512 samples');
    ok(host.hosts === 2 && (await V('solo')).stopped === 1 && host.hosts === 1, 'solo: only Vital stays loaded');
    // the battery controls exist on the fake and change through the normal patch path
    const info = await V('inspect'); const saver = P.batterySaver(info.parameters);
    ok(saver.values.polyphony === 8 && saver.values.oversampling === '1x', 'battery: polyphony 16 → 8, oversampling 2x → 1x');
    ok((await V('patch', { parameters: saver.values })).ok && (await V('values', { keys: ['polyphony'] })).values.polyphony.value === 8, 'applied to the live instrument');
    // a 1-bar loop at 120 BPM, right away: exactly 2 s; a phrase's notes kept with their exact times
    const arp = L.phrase('arp', 4); assert.ok((await V('sequence', { sequence: arp.notes, loop: arp.loop })).ok);
    let t0 = Date.now(); let st = await V('record', { bars: 1, bpm: 120, beats: 4 }); ok(st.ok && st.recording && !st.armed && Math.abs(st.seconds - 2) < 1e-9, 'record 1 bar now');
    assert.match((await V('record-take')).error, /still recording/); out.checks++;
    st = await until(async () => { const s = await V('record-status'); return s.done && s; }, 8000, 'the loop to finish'); out.timings.oneBarMs = Date.now() - t0;
    let t = await V('record-take'); ok(t.ok && t.frames === 96000 && t.sampleRate === 48000 && Buffer.from(t.wav).subarray(0, 4).toString() === 'RIFF', 'record-take: a 96,000-frame WAV (2.000 s) handed back as bytes');
    const pcm = P.decodeWav(new Uint8Array(t.wav)); ok(pcm.channels[0].length === 96000 && Math.abs(Math.max(...pcm.channels[0].subarray(0, 96000)) - t.peak) < 1e-3 && !t.silent, 'the instrument\'s own output is in the WAV (before the monitor volume)');
    const ons = t.notes; ok(ons.length >= 7, `the phrase's notes kept (${ons.length})`);
    const gaps = ons.slice(1, 6).map((n, i) => Math.round((n.time - ons[i].time) * 48000)); ok(gaps.every(g => g === 12000), 'notes sample-accurate: 1/8 notes 12,000 samples apart (' + gaps.join(',') + ')');
    ok(ons.every(n => n.length > 0 && n.time + n.length <= 2 + 1e-9 && n.velocity > 0), 'every note closed inside the loop');
    assert.match((await V('record-take')).error, /No finished loop/); out.checks++;
    assert.ok((await V('sequence', { sequence: [] })).ok);
    // "starts on my first note": nothing kept until a note is played, then the take begins at that note
    st = await V('record', { bars: 1, bpm: 200, beats: 2, wait: 'note' }); ok(st.armed, 'armed: waiting for the first note');
    await sleep(400); ok((await V('record-status')).progress === 0, 'nothing recorded while waiting');
    host.send({ action: 'midi', plugin: vital.path, note: 62, on: true, velocity: 90 }); await sleep(150); host.send({ action: 'midi', plugin: vital.path, note: 62, on: false });
    await until(async () => (await V('record-status')).done, 6000, 'the armed loop');
    t = await V('record-take'); ok(t.frames === Math.round(2 * 60 / 200 * 48000) && t.notes[0].note === 62 && t.notes[0].time === 0 && t.notes[0].velocity === 90, 'the take starts on the first note (time 0), 0.6 s at 200 BPM, 2 beats');
    const first = P.decodeWav(new Uint8Array(t.wav)).channels[0]; ok(Math.max(...first.subarray(0, 2400).map(Math.abs)) > .01, 'and its sound is there from the first samples');
    // cancel; a stop mid-take drops it with a reason; refusals
    assert.ok((await V('record', { bars: 16, bpm: 60 })).ok); ok(!(await V('record-cancel')).recording, 'cancel');
    assert.ok((await V('record', { bars: 4, bpm: 120 })).ok); await V('live-stop'); st = await V('record-status'); ok(!st.recording && !st.done && /stopped before/.test(st.note), 'a stop mid-take drops it, with a reason');
    assert.match((await V('record', { bars: 4, bpm: 120 })).error, /Start live audio first/);
    assert.ok((await V('live-start', { ...L.parse(pick.value), buffer: 512 })).playing);
    assert.match((await V('record', { bars: 3, bpm: 120 })).error, /1, 2, 4, 8 or 16 bars/); assert.match((await V('record', { bars: 4, bpm: 300 })).error, /50–220/);
    assert.match((await V('record', { bars: 16, bpm: 50, beats: 7 })).error, /up to 90 seconds/); out.checks += 4;
    await V('live-stop'); host.stop(); await sleep(300);
    ok(fs.readdirSync(path.join(dir, 'creative-vst')).filter(p => p.startsWith('session-')).length === 0, 'session folders (and loop files) removed');
    out.result = `Park jam: ${out.checks} checks passed (core, parkSave, the host's loop recorder with the fake laptop host).`;
    console.log(JSON.stringify(out, null, 1));
  } finally { host?.stop(); delete process.env.FAKE_SD_NO_UA; await sleep(200); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
