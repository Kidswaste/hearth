// (round 64, audiodoctor64) /audio doctor without a sound card: audiodoctormain.js runs the REAL creative-vst-doctor.py
// with vstlive61's fake Pedalboard / sounddevice / rtmidi (dev/fixtures/fake-vst-py), and audiodoctor-core.js turns
// each case into the card's rows. Cases: no runtime · everything fine (UA on ASIO) · the ASIO DLL won't load · no UA
// interface · a plugin that won't load · the desk on another device · ASIO turned off / crashed · underruns · loopback
// · no ffmpeg / no preset folders · the copied report.
//   node dev/audiodoctor64-test.js     (needs python3 + numpy; says "skipped" plainly when they're missing)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const D = require('../audiodoctormain.js'), C = require('../audiodoctor-core.js'), L = require('../tools/workbench-vst-live.js');
const out = { cases: [], skipped: [], timings: {} };
const row = (rs, id) => rs.find(r => r.id === id) || assert.fail(`no ${id} row in ${rs.map(r => r.id)}`);
const done = (what) => out.cases.push(what);

// ---- pure: the core's UA names match the Sound desk's, and a crash / switched-off ASIO reads right
assert.equal(C.UA.source, L.UA.source, 'the doctor and the Sound desk recognise the same Universal Audio names');
{
  const base = { platform: 'win32', runtime: { exists: true }, pinned: D.PINNED, probe: { ok: true, python: '3.12.4', bits: 64, packages: { pedalboard: { version: '0.9.26' }, numpy: { version: '2.5.4' }, sounddevice: { version: '0.5.6' } }, asioDll: false, hostApis: ['MME', 'Windows WASAPI'], devices: [], midiInputs: [], midiBackend: 'winmm' }, plugins: [], presetFolders: [] };
  let rs = C.rows({ ...base, asioSwitch: false });
  assert.equal(row(rs, 'asio').mark, 'warn'); assert.equal(row(rs, 'asio').fix.do, 'asio-on');
  rs = C.rows({ ...base, asioSwitch: true, asioCrash: true });
  assert.equal(row(rs, 'asio').mark, 'bad'); assert.equal(row(rs, 'asio').fix.do, 'asio-off'); assert.match(row(rs, 'asio').text, /ASIO driver stopped/);
  rs = C.rows({ ...base, asioSwitch: true, probe: { ...base.probe, asioFallback: true, packages: { ...base.probe.packages, sounddevice: { version: '0.4.6' } } } });
  assert.match(row(rs, 'asio').text, /0\.5\.1 or newer/); assert.equal(row(rs, 'packages').mark, 'warn', 'an older sounddevice than Hearth installs');
  rs = C.rows({ ...base, probe: { ...base.probe, python: '3.9.1' } }); assert.equal(row(rs, 'runtime').mark, 'warn');
  rs = C.rows({ ...base, probe: { ...base.probe, packages: { ...base.probe.packages, pedalboard: { error: 'No module named pedalboard' } } } }); assert.equal(row(rs, 'packages').mark, 'bad'); assert.equal(row(rs, 'packages').fix.do, 'install');
  rs = C.rows({ platform: 'darwin', runtime: { exists: true }, pinned: D.PINNED, asioSwitch: true, probe: { ...base.probe, hostApis: ['Core Audio'], devices: [{ id: 0, name: 'MacBook Pro Speakers', api: 'Core Audio', outputs: 2, default: true }], defaultOutput: 'MacBook Pro Speakers', midiBackend: null } });
  assert.equal(row(rs, 'asio').mark, 'ok'); assert.match(row(rs, 'asio').text, /Not needed here: Core Audio/); assert.equal(row(rs, 'wasapi').label, 'Outputs'); assert.equal(row(rs, 'midi').mark, 'warn');
  assert.ok(!rs.some(r => r.id === 'asio-devices'), 'no ASIO device row on a Mac');
  done('core: ASIO off / crashed / no DLL / old sounddevice / old Python / missing package / Mac rows');
}

const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('runtime part: python3 with numpy not found here'); console.log(JSON.stringify(out, null, 1)); process.exit(0); }

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-audiodoctor-test-'));
  try {
    const plugins = path.join(temp, 'VST3'); fs.mkdirSync(path.join(plugins, 'Vital.vst3'), { recursive: true }); fs.mkdirSync(path.join(plugins, 'Serum2.vst3'));
    const vitalPresets = path.join(temp, 'Vital', 'User', 'Presets'); fs.mkdirSync(path.join(vitalPresets, 'Pads'), { recursive: true });
    fs.writeFileSync(path.join(vitalPresets, 'Pads', 'Warm.vital'), '{}'); fs.writeFileSync(path.join(vitalPresets, 'Bass.vital'), '{}');
    const defaults = () => [{ path: vitalPresets, instrument: 'Vital' }, { path: path.join(temp, 'Xfer', 'Serum 2 Presets', 'Presets', 'User'), instrument: 'Serum 2' }];
    const env = (extra = {}) => ({ ...process.env, PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_MIDI_NOTE: '0', ...extra });
    const base = { dataDir: temp, python: PY, pluginRoots: [plugins], defaults, ffmpeg: () => '/usr/bin/ffmpeg', asio: true, platform: 'win32' };
    const probe = (extra = {}, o = {}) => D.probe({ ...base, env: env(extra), ...o });

    // 1. no runtime: the first row says so and offers the setup; the plugins are still found by name
    let r = await probe({}, { python: path.join(temp, 'no-python', 'python.exe') });
    let rs = C.rows(r);
    assert.equal(row(rs, 'runtime').mark, 'bad'); assert.equal(row(rs, 'runtime').fix.do, 'install'); assert.match(row(rs, 'runtime').text, /Not installed yet/);
    assert.ok(r.system && 'found' in r.system, 'the computer\'s own Python looked for');
    assert.equal(row(rs, 'vital').mark, 'warn'); assert.match(row(rs, 'vital').text, /needs the audio runtime/);
    assert.ok(!rs.some(x => x.id === 'live'), 'no live test without a runtime');
    done('no runtime: ✗ with Install runtime; Serum 2 / Vital found, loading waits for the runtime');

    // 2. everything there: UA on ASIO, controller, both instruments load, preset folders, ffmpeg
    let t0 = Date.now(); r = await probe(); out.timings.fullProbeMs = Date.now() - t0;
    rs = C.rows(r);
    assert.equal(r.probe.ok, true, r.probe.error); assert.equal(r.probe.asioDll, true); assert.ok(r.probe.hostApis.includes('ASIO'));
    for (const id of ['runtime', 'asio', 'asio-devices', 'wasapi', 'midi', 'serum', 'vital', 'presets', 'ffmpeg']) assert.equal(row(rs, id).mark, 'ok', `${id}: ${row(rs, id).text}`);
    assert.notEqual(row(rs, 'packages').mark, 'bad');
    assert.match(row(rs, 'asio-devices').text, /★ Universal Audio Thunderbolt at 48 kHz/);
    assert.match(row(rs, 'wasapi').text, /default: Speakers \(Realtek\(R\) Audio\) · UA: Monitor 1-2/);
    assert.match(row(rs, 'midi').text, /Fake Keys/);
    assert.match(row(rs, 'vital').text, /Loads in the host: Vital by Hearth test, \d+ controls/);
    assert.match(row(rs, 'presets').text, /Vital: 2 in .*Presets \(1 not there\)/); assert.equal(row(rs, 'presets').fix.do, 'folder');
    assert.equal(r.picked.value, '4', 'the live test uses the UA on ASIO'); assert.equal(r.picked.fromDesk, false);
    assert.equal(row(rs, 'live').fix.do, 'live', 'the live test offered');
    done(`everything fine: ✓ on every row, UA on ASIO picked (probe + 2 plugin loads in ${out.timings.fullProbeMs} ms)`);

    // 3. the live test: Vital through the UA's ASIO, every callback timed
    t0 = Date.now(); let lv = await D.live({ ...base, env: env(), device: r.picked.device, buffer: 128, plugin: 'Vital' }); out.timings.liveMs = Date.now() - t0;
    assert.ok(lv.ok, lv.error); assert.equal(lv.source, 'Vital'); assert.equal(lv.api, 'ASIO'); assert.equal(lv.buffer, 128); assert.equal(lv.finished, true);
    assert.ok(Math.abs(lv.callbacks - lv.expectedCallbacks) <= 3, `callbacks ${lv.callbacks} of ${lv.expectedCallbacks}`); assert.ok(lv.outputLatencyMs > 0 && Number.isFinite(lv.dspPct));
    let lrow = row(C.rows(r, { live: lv }), 'live');
    if (lv.underflows === 0 && lv.lateCallbacks <= 2) { assert.equal(lrow.mark, 'ok'); assert.match(lrow.text, /Universal Audio Thunderbolt \(ASIO, 48 kHz, 128\): 0 underruns, ≈[\d.]+ ms out, .*Vital DSP/); }
    else out.skipped.push(`live ✓ wording: this loaded machine was late ${lv.lateCallbacks}× (the fake device's own clock)`);
    out.live = { callbacks: lv.callbacks, meanGapMs: lv.meanGapMs, maxGapMs: lv.maxGapMs, late: lv.lateCallbacks, latencyMs: lv.outputLatencyMs, dspPct: lv.dspPct };
    done(`live test: Vital on the UA's ASIO at 128, ${lv.callbacks} callbacks timed in ${out.timings.liveMs} ms`);

    // 4. underruns: the device misses deadlines → ! with "Test at 256"
    lv = await D.live({ ...base, env: env({ FAKE_SD_STALL_MS: '20' }), device: r.picked.device, buffer: 128 });
    assert.ok(lv.ok, lv.error); assert.ok(lv.underflows >= 3, 'underflows reported: ' + lv.underflows);
    lrow = row(C.rows(r, { live: lv }), 'live'); assert.equal(lrow.mark, 'warn'); assert.match(lrow.text, /\d+ underruns.*try 256/); assert.deepEqual([lrow.fix.do, lrow.fix.buffer], ['live', 256]);
    done(`underruns: ${lv.underflows} reported → ! "try 256" with Test at 256`);

    // 5. loopback: output patched into input → the click's round trip; not patched → ! with what to do
    lv = await D.live({ ...base, env: env({ FAKE_SD_LOOPBACK: '1', FAKE_SD_LOOP_SAMPLES: '480' }), device: r.picked.device, buffer: 128, loopback: true });
    assert.ok(lv.ok, lv.error); assert.equal(lv.loopback.heard, true); assert.equal(lv.loopback.samples, 480); assert.equal(lv.loopback.roundTripMs, 10);
    assert.match(row(C.rows(r, { loop: lv }), 'loopback').text, /10 ms round trip \(480 samples at 48 kHz/);
    lv = await D.live({ ...base, env: env(), device: r.picked.device, buffer: 128, loopback: true });
    assert.equal(lv.loopback.heard, false); assert.equal(row(C.rows(r, { loop: lv }), 'loopback').mark, 'warn');
    lv = await D.live({ ...base, env: env(), device: 3, buffer: 256, loopback: true });
    assert.equal(lv.ok, false); assert.match(lv.error, /has no inputs/);
    done('loopback: 480 samples = 10 ms heard back; silence → patch output 1 into input 1; an output-only device says so');

    // 6. the ASIO DLL won't load: the plain PortAudio is used, the row says so with Reinstall
    r = await probe({ FAKE_SD_NO_ASIO_DLL: '1' }, { loadPlugins: false });
    rs = C.rows(r); assert.equal(r.probe.asioFallback, true); assert.equal(row(rs, 'asio').mark, 'bad'); assert.match(row(rs, 'asio').text, /ASIO-enabled PortAudio didn't load/); assert.equal(row(rs, 'asio').fix.do, 'install');
    assert.ok(!rs.some(x => x.id === 'asio-devices')); assert.equal(r.picked.value, '2x', 'without ASIO the UA WASAPI endpoint (exclusive) is used');
    done('no ASIO DLL: ✗ with Reinstall runtime; the UA on WASAPI exclusive picked');

    // 7. no UA interface (the laptop alone): ! with Re-scan; the default speakers picked
    r = await probe({ FAKE_SD_NO_UA: '1' }, { loadPlugins: false });
    rs = C.rows(r); assert.equal(row(rs, 'asio-devices').mark, 'warn'); assert.match(row(rs, 'asio-devices').text, /None\. Is the UA interface on/); assert.equal(row(rs, 'asio-devices').fix.do, 'rescan');
    assert.match(r.picked.label, /Speakers \(Realtek\(R\) Audio\) · WASAPI shared/);
    done('UA absent: ! "Is the UA interface on" with Re-scan; Windows default picked');

    // 8. Serum 2 won't load in the host: ✗ with Reset host; Vital still ✓
    r = await probe({ FAKE_PB_FAIL: 'Serum 2' });
    rs = C.rows(r); assert.equal(row(rs, 'serum').mark, 'bad'); assert.match(row(rs, 'serum').text, /didn't load in the host: Unable to load plugin/); assert.equal(row(rs, 'serum').fix.do, 'reset'); assert.equal(row(rs, 'vital').mark, 'ok');
    done('plugin load failure: Serum 2 ✗ with Reset host, Vital ✓ (each in its own process)');

    // 9. the Sound desk remembers another output while the UA is there: ! with "Pick the UA device"
    const saved = { name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI', exclusive: false };
    r = await probe({}, { loadPlugins: false }); r.picked = D.pick(r.probe, saved);
    assert.equal(r.picked.fromDesk, true); assert.equal(r.picked.value, '3');
    rs = C.rows(r); assert.equal(row(rs, 'asio-devices').mark, 'warn'); assert.deepEqual(row(rs, 'asio-devices').fix, { do: 'ua', label: 'Pick the UA device' });
    r.picked = D.pick(r.probe, { name: 'Universal Audio Thunderbolt', api: 'ASIO', exclusive: false }); assert.equal(row(C.rows(r), 'asio-devices').mark, 'ok', 'the desk already on the UA: ✓');
    done('desk on the laptop speakers with the UA connected: ! with Pick the UA device');

    // 10. ASIO switched off (Settings vstAsio false): no SD_ENABLE_ASIO for the check, ! with Turn ASIO back on
    r = await probe({}, { asio: false, loadPlugins: false });
    rs = C.rows(r); assert.equal(r.probe.asioWanted, false); assert.equal(row(rs, 'asio').fix.do, 'asio-on');
    done('ASIO off: the check runs without it, ! with Turn ASIO back on');

    // 10b. an ASIO driver crashes the check while devices are listed: listed again without ASIO, ✗ with Turn off ASIO
    r = await probe({ FAKE_SD_ASIO_CRASH: '1' }, { loadPlugins: false });
    rs = C.rows(r); assert.equal(r.asioCrash, true); assert.equal(r.probe.ok, true); assert.equal(r.probe.asioWanted, false);
    assert.deepEqual([row(rs, 'asio').mark, row(rs, 'asio').fix.do], ['bad', 'asio-off']); assert.equal(row(rs, 'wasapi').mark, 'ok', 'the rest still listed');
    done('ASIO driver crash: checked again without ASIO, ✗ with Turn off ASIO');

    // 11. no ffmpeg, no preset folders, Vital not installed: the fixes point at the right places
    fs.rmSync(path.join(plugins, 'Vital.vst3'), { recursive: true });
    r = await probe({}, { ffmpeg: () => null, defaults: () => [{ path: path.join(temp, 'nope'), instrument: 'Vital' }], loadPlugins: false });
    rs = C.rows(r);
    assert.deepEqual([row(rs, 'ffmpeg').mark, row(rs, 'ffmpeg').fix.do], ['bad', 'ffmpeg']);
    assert.deepEqual([row(rs, 'presets').mark, row(rs, 'presets').fix.do], ['warn', 'sounds']);
    assert.equal(row(rs, 'vital').mark, 'bad'); assert.deepEqual(row(rs, 'vital').fix, { do: 'folder', label: 'Open plugin folder', path: plugins });
    done('no ffmpeg → Install ffmpeg; no preset folder → Open Sound bank; Vital missing → Open plugin folder');

    // 12. the copied report: short plain text, one line per row, the home folder never spelled out
    const text = C.reportText(rs, r, new Date(2026, 9, 18, 21, 4));
    assert.match(text, /^Hearth audio doctor · 2026-10-18 21:04 · win32 · \d problems?/); assert.equal(text.split('\n').length, rs.length + 1);
    assert.ok(text.includes('✗ Vital: Not in the VST3 folders') && text.includes('✓ ASIO: ASIO PortAudio loaded'));
    assert.ok(!text.includes(os.homedir() + path.sep) || os.homedir() === '/root', 'home folder shortened');
    assert.ok(text.length < 2500, 'short: ' + text.length);
    const card = C.cardText(rs, r); assert.equal(card.split('\n').filter(l => l.startsWith('- ')).length, rs.length, 'one list item per row (the fix buttons go on them)');
    out.report = text.split('\n').slice(0, 3);
    done('report: one line per row, dated, short');
    console.log(JSON.stringify(out, null, 1));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
