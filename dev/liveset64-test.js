// (round 64, liveset64) Live set for an open mic, without a sound card or the real plugins:
//   1. the pure parts (tools/liveset-core.js): the set model, the keys, the bar grid, the one knob, preset preload timing,
//      which preset to keep preloaded, how a take fits a song's tempo, the open-mic quest's 4th step and the proof text;
//   2. the main process's guards (creative-vstmain.js: clip paths, run paths, liveSave names);
//   3. the REAL instrument host (creative-vst-host.py + creative-vst-liveset.py) with dev/fixtures/fake-vst-py: a clip
//      launched on the bar lands on the exact sample, the twin switches a heavy preset on the beat with no underrun (while
//      loading the same preset the desk's way does underrun), a held note carries over, the knob filters, panic fades
//      everything out, and the run recorder writes the whole mix with its log.
//   node dev/liveset64-test.js        (the host part needs python3 + numpy; it says "skipped" plainly otherwise)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const C = require('../tools/liveset-core.js'), P = require('../tools/parkjam-core.js'), QC = require('../tools/quest-core.js'), Q = require('../tools/quest-paris.js');
const { pool, jobOf, liveSave, liveClip, liveRunPath } = require('../creative-vstmain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(20); } };
const out = { checks: 0, skipped: [], timings: {} }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };

// ---- 1. the set model and the keys
let set = C.create({ name: 'Open mic · Oct', instrument: 'Vital', bpm: 96 });
ok(set.v === 1 && set.scenes.length === 1 && set.scenes[0].bpm === 96 && set.quantize === 'bar', 'a new set: one song at 96 BPM, launches on the bar');
const loop = C.addPad(set, 0, { kind: 'clip', label: 'Belleville 4 bars', bars: 4, source: { type: 'take', file: '/x/a.wav', bpm: 96 } });
const song = C.addPad(set, 0, { kind: 'clip', label: 'Sunday song', loop: false, bars: 32, source: { type: 'song' } });
const pad1 = C.addPad(set, 0, { kind: 'preset', label: 'Warm pad', instrument: 'Vital', preset: { label: 'Warm pad' } });
const pad2 = C.addPad(set, 0, { kind: 'preset', label: 'Loud lead', instrument: 'Vital', preset: { label: 'Loud lead', id: 'sb-1', from: 'soundbank' } });
const sc = set.scenes[0];
ok(sc.pads.map(p => C.keyOf(sc, p)).join('') === '12qw', 'keys: clips on 1–0, presets on Q–P, in order');
ok(C.padForKey(sc, 'W') === pad2 && C.padForKey(sc, '2') === song && C.padForKey(sc, '3') === null, 'a key finds its pad (any case); an empty key finds none');
ok(C.findPad(sc, 'warm') === pad1 && C.findPad(sc, 'q') === pad1 && C.findPad(sc, loop.id) === loop, 'a pad by key, label start or id');
assert.throws(() => C.addPad(set, 0, { kind: 'preset', label: 'S2', instrument: 'Serum 2', preset: { label: 'x' } }), /plays Vital/); out.checks++;
for (let i = 0; i < 8; i++) C.addPad(set, 0, { kind: 'clip', label: 'c' + i, source: { type: 'take', file: '/x', bpm: 96 } });
assert.throws(() => C.addPad(set, 0, { kind: 'clip', label: 'eleventh' }), /up to 10 clip pads/); out.checks++;
const again = C.validate(JSON.parse(JSON.stringify(set)));
ok(again.scenes[0].pads.length === 12 && again.scenes[0].pads[0].source.file === '/x/a.wav' && again.scenes[0].pads.at(-1).preset.from === 'soundbank', 'the set survives a save / load (validate)');
ok(C.validate({ v: 2 }).scenes.length === 1 && C.validate(null).name === 'Open mic set', 'a damaged set starts fresh instead of breaking the view');
C.addScene(set); ok(set.scenes[1].bpm === 96 && set.scenes[1].name === 'Song 2', 'a new song takes the last tempo');
const key = (k, o = {}) => C.action({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o }, o);
ok(key('3').do === 'pad' && key('E').key === 'e' && key('Escape').do === 'panic' && key(' ').do === 'stop' && key('Enter').do === 'scene' && key('ArrowDown').by === 1 && key('\\').do === 'stage', 'every action has a key (pads, panic, stop, scene, songs, stage)');
ok(key('Enter', { ctrlKey: true }).do === 'rehearse' && key('Enter', { metaKey: true, shiftKey: true }).do === 'perform' && key(',').by === -0.1 && key('/').to === 0 && key(']').by === 1, 'Ctrl/⌘+Enter rehearse, +Shift perform, knob and tempo keys');
ok(key('3', { typing: true }) === null && key('Enter', { ctrlKey: true, typing: true }).do === 'rehearse' && key('s', { altKey: true }) === null && key('z') === null, 'typing in a field is left alone (except Ctrl+Enter); unknown keys are not taken');

// ---- 2. the bar grid (identical to the host's), tempo changes, the counter
const t = { origin: 1000, bpm: 120, beats: 4, rate: 48000 };
ok(C.spb(t) === 24000 && C.boundary(t, 1000) === 1000 && C.boundary(t, 1001) === 97000 && C.boundary(t, 1001, 'beat') === 25000 && C.boundary(t, 5, 'bar') === 1000 && C.boundary(t, 1234, 'now') === 1234, 'next bar / beat line from any sample (before the origin: the first bar)');
ok(JSON.stringify(C.where(t, 97000)) === JSON.stringify({ bar: 2, beat: 1, phase: 0 }) && C.where(t, 97000 + 36000).beat === 2, 'bar 2 beat 1 at one bar; half a beat later still beat 2');
const t3 = { origin: 0, bpm: 100, beats: 3, rate: 44100 }; ok(C.boundary(t3, 1) === Math.round(3 * 60 / 100 * 44100), 'a 3/4 bar at 100 BPM, 44.1 kHz');
const moved = C.retempo(t, 49000, 90); ok(Math.abs(C.where(moved, 49000).phase - 0) < 1e-9 && C.where(moved, 49000).beat === 3 && moved.bpm === 90, 'a tempo change keeps the beat we are on (re-anchored like the host)');
const st = { ...t, position: 97000 + 4800, latencyMs: 100 }; ok(C.audible(st, 0) === 97000 && C.counter(st, 0).text === 'Bar 2 · 1/4' && C.counter(st, 500).beat === 2, 'the counter shows what is heard: the render position minus the output latency, plus the time since');
// the one knob, the same curve as the host
ok(!C.fxFilter(0.01).kind && C.fxFilter(-1).kind === 'low' && Math.round(C.fxFilter(-1).hz) === 150 && Math.round(C.fxFilter(1).hz) === 6000 && Math.round(C.fxFilter(-0.02).hz) > 17000, 'the knob: middle = off, left low-pass down to 150 Hz, right high-pass up to 6 kHz');
ok(C.fxLabel(0) === 'Filter off' && /^Low-pass 1\.1 kHz$/.test(C.fxLabel(-0.6)) && /^High-pass \d+ Hz$/.test(C.fxLabel(0.4)), 'knob labels: ' + C.fxLabel(-0.6) + ' / ' + C.fxLabel(0.4));

// ---- 3. preset preload timing and the next preset to keep in the twin
let plan = C.switchPlan({ transport: t, now: 1001, ready: true });
ok(!plan.preload && plan.at === 25000 && plan.beat === 2, 'a preloaded preset switches on the next beat');
plan = C.switchPlan({ transport: t, now: 1001, ready: false, loadMs: 400 });
ok(plan.preload && plan.at === 25000 && plan.at - 1001 >= (400 + 30) * 48 && C.switchPlan({ transport: t, now: 1001, ready: false, loadMs: 600 }).at === 49000, 'not preloaded: preload first, switch on the first beat after it can be loaded (+30 ms)');
plan = C.switchPlan({ transport: t, now: 1001, ready: false, loadMs: 1200, unit: 'bar' }); ok(plan.at === 97000 && plan.waitMs === Math.round((97000 - 1001) / 48), 'a slow (1.2 s) preset waits for the next bar after it is ready: ' + plan.waitMs + ' ms');
const order = C.create(); C.addPad(order, 0, { kind: 'preset', label: 'A', instrument: 'Vital', preset: { label: 'A' } }); C.addPad(order, 0, { kind: 'preset', label: 'B', instrument: 'Vital', preset: { label: 'B' } });
C.addScene(order); C.addPad(order, 1, { kind: 'preset', label: 'C', instrument: 'Vital', preset: { label: 'C' } });
const [A, B] = C.presets(order.scenes[0]), [Cc] = C.presets(order.scenes[1]);
ok(C.nextPreset(order, 0, null) === A && C.nextPreset(order, 0, A.id) === B && C.nextPreset(order, 0, B.id) === Cc && C.nextPreset(order, 1, Cc.id) === A, 'the twin keeps the next preset in set order (across songs, wrapping from the song shown)');

// ---- 4. takes vs the song's tempo; the open-mic quest and its proof
const s96 = { bpm: 96, beats: 4 };
ok(C.fit({ bpm: 96 }, s96).ratio === 1 && C.fit({ bpm: 100 }, s96).stretch && !C.fit({ bpm: 140 }, s96).stretch && /drifts/.test(C.fit({ bpm: 140, place: 'Belleville' }, s96).warn), 'a take at another tempo: stretched within −20 %/+25 %, else played at its own tempo with a plain warning');
ok(C.loopFrames(4, s96, 48000) === 480000 && C.needsPrepare({ kind: 'clip', file: '/a', prepared: { bpm: 96 } }, s96) === false && C.needsPrepare({ kind: 'clip', file: '/a', prepared: { bpm: 90 } }, s96), 'a loop is exactly its bars at the song tempo; a tempo change re-fits it');
const OM = Q.findPersonal('openmic');
ok(OM && OM.id === 'c-pq-openmic' && JSON.stringify(OM.steps.at(-1)) === JSON.stringify(C.PLAY_STEP) && OM.steps.length === 4, 'the open-mic quest has a 4th step "Play your set" (no drift from LiveSetCore.PLAY_STEP)');
ok(!C.fits(0, 'Rehearsal') && !C.fits(1, 'Rehearsal') && C.fits(2, 'Rehearsal') && C.fits(3, 'Rehearsal') && C.fits(1, 'Performance') && !C.fits(0, 'Performance'), 'a rehearsal proves "Decide your next step" / "Play your set"; a performance also "Go and watch"');
const run = { kind: 'Rehearsal', seconds: 312.4, bars: 125, peak: .7, levels: [-18, -17.5], events: [{ kind: 'launch', bar: 1, beat: 1, slot: loop.id }, { kind: 'switch', bar: 9, beat: 3, id: pad2.id }, { kind: 'panic', bar: 120, beat: 1 }], labels: { [loop.id]: 'Belleville 4 bars', [pad2.id]: 'Loud lead' } };
ok(C.runSummary(run) === 'Rehearsal · 5:12 · 125 bars · 1 launch · 1 preset switch · 1 panic', 'a run in one line: ' + C.runSummary(run));
const text = C.proofText(run, set);
QC.checkProof({ type: 'file', title: 'Rehearsal.mp3', path: '/tmp/r.mp3', kind: 'audio/mpeg', bytes: 10, fingerprint: 'c'.repeat(64), images: [], ...text }); out.checks++;
ok(/bar 1\.1 launch Belleville 4 bars · bar 9\.3 switch Loud lead/.test(text.excerpt) && /cannot hear/.test(text.coverage), 'the proof text passes Codex\'s checkProof; the log reads in pad names; honest coverage');
const qs = QC.upgrade(QC.initial()), camp = Q.startPersonal(qs, 'openmic'); ok(camp.quests.length === 4 && camp.quests[3].title === 'Play your set' && camp.quests[3].id === 'q-pq-openmic-4', 'a journal started now has the 4th step with a stable id');

// ---- 5. the main process: clip paths stay in Hearth's folders, run paths are made there, file names are plain
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-liveset-'));
try {
  const f = liveSave(temp, 'Open mic: Oct?', 'clip pad-1.wav', new Uint8Array([1, 2, 3]));
  ok(f === path.join(temp, 'creative-live', 'Open mic Oct', 'clip pad-1.wav') && fs.readFileSync(f).length === 3 && !fs.existsSync(f + '.part'), 'liveSave: the set\'s own folder, written atomically');
  assert.throws(() => liveSave(temp, 'x', '../evil.wav', 'a'), /Invalid/); assert.throws(() => liveSave(temp, 'x', 'a.exe', 'a'), /Invalid/); out.checks++;
  ok(liveClip(temp, f) === f, 'a clip in the live set folder loads');
  assert.throws(() => liveClip(temp, path.join(temp, 'elsewhere.wav')), /park sketches or the live set/); assert.throws(() => liveClip(temp, path.join(temp, 'creative-live', '..', 'x.wav')), /park sketches|gone/); assert.throws(() => liveClip(temp, 'relative.wav'), /WAV/); out.checks++;
  const rp = liveRunPath(temp, 'Open mic: Oct?', 'Performance'); ok(path.dirname(rp) === path.join(temp, 'creative-live', 'Open mic Oct') && /^Performance \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d\.wav$/.test(path.basename(rp)), 'a run\'s WAV path is made by main: ' + path.basename(rp));
  const j = jobOf({ action: 'launch', plugin: 'x', slot: 'pad-1', mode: 'toggle', at: 'bar', fx: 3, kind: 'Rehearsal', file: '/etc/passwd', output: '/tmp/x.wav', extra: 1 }, 'Vital');
  ok(j.slot === 'pad-1' && j.mode === 'toggle' && j.at === 'bar' && j.fx === 1 && !('file' in j) && !('output' in j) && !('extra' in j), 'jobOf: pad fields pass (knob clamped); file / output never come from the window');
  assert.throws(() => jobOf({ action: 'launch', slot: 'x'.repeat(65) }), /pad/); assert.throws(() => jobOf({ action: 'pad-fx', fx: NaN }), /pad/); out.checks++;
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
out.core = 'set model / keys / grid / knob / preload timing / next preset / tempo fit / quest step / proof / main guards passed';

// ---- 6. the real host with the fake Pedalboard / sounddevice
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('host part: python3 with numpy not found here'); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
// the knob's curve is the same number in Python
const pyfx = spawnSync(PY, ['-c', `import importlib.util,json;s=importlib.util.spec_from_file_location('l','${path.join(__dirname, '..', 'creative-vst-liveset.py').replace(/\\/g, '/')}');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps([m.fx_filter(v) for v in (-1,-0.6,0,0.01,0.4,1)]))`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
ok(pyfx.status === 0 && JSON.parse(pyfx.stdout).every(([k, hz], i) => { const js = C.fxFilter([-1, -0.6, 0, 0.01, 0.4, 1][i]); return k === js.kind && Math.abs(hz - js.hz) < 1e-6; }), 'the knob curve is identical in the host (fx_filter) and the view (fxFilter)');
const wavOf = file => { const b = fs.readFileSync(file); return P.decodeWav(new Uint8Array(b.buffer, b.byteOffset, b.length)); };
const rms = (ch, a, b) => { let s = 0; for (let i = a; i < b; i++) s += ch[i] * ch[i]; return Math.sqrt(s / Math.max(1, b - a)); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-liveset-host-'));
  const root = path.join(dir, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true });
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_MIDI_NOTE: '0', FAKE_PB_STATE_S: '0.15' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  try {
    host = pool({ dataDir: dir, python: PY, roots: [root] }); assert.ok((await host.status()).ok);
    const vital = host.scan().plugins.find(p => p.name === 'Vital');
    const V = async (action, extra = {}) => { const r = await host.request({ action, plugin: vital.path, name: 'Vital', ...extra }); if (!r.ok) throw Error(action + ': ' + r.error); return r; };
    const send = (action, extra = {}) => host.send({ action, plugin: vital.path, name: 'Vital', ...extra });
    await V('open', { live: true, device: 4, buffer: 512, gain: .2 }); // the UA on ASIO (fake), 512 samples
    ok((await V('inspect')).parameters.length > 0, 'Vital (fake) live on the UA, 512 samples');
    // two presets: "Soft" (level 0.5, what plays) and "Loud" (level 0.9, preloaded later)
    await V('patch', { parameters: { level: .9 } }); const loud = (await V('snapshot')).state; await V('patch', { parameters: { level: .5 } });
    // a 1-bar clip at 120 BPM (a 1 kHz tone) in the live set folder
    const rate = 48000, bar = 96000, tone = new Float32Array(bar).map((_, i) => .4 * Math.sin(2 * Math.PI * 1000 * i / rate));
    const clipFile = liveSave(dir, 'Test set', 'clip a.wav', P.encodeWav({ rate, channels: [tone, tone] }));
    let s = await V('set-open', { bpm: 120, beats: 4, quantize: 'bar' }); ok(s.open && s.bpm === 120 && s.beats === 4, 'set-open: the transport runs at 120 BPM, 4/4');
    assert.match((await host.request({ action: 'clip-load', plugin: vital.path, name: 'Vital', slot: 'a', file: path.join(dir, 'nope.wav') })).error, /park sketches or the live set/); out.checks++;
    ok((await V('clip-load', { slot: 'a', file: clipFile, loop: true })).seconds === 2, 'a clip loads in the host (2 s, a loop)');
    // the run recorder first, so everything below is in the WAV
    const r0 = await V('run-record', { set: 'Test set', kind: 'Rehearsal' }); ok(r0.recording && r0.kind === 'Rehearsal', 'Rehearse: the run recorder starts');
    // 1. launch quantized to the bar (sent on the no-reply stream like a pad press)
    let t0 = Date.now(); ok(send('launch', { slot: 'a', mode: 'toggle', at: 'bar' }).ok, 'a pad press goes on the stream (no reply)');
    s = await until(async () => { const x = await V('set-status'); return x.pads.a?.state !== 'stopped' && x; }, 2000, 'the launch');
    const launchAt = s.pads.a.at ?? null;
    s = await until(async () => { const x = await V('set-status'); return x.pads.a.state === 'playing' && x; }, 4000, 'the clip to start'); out.timings.launchToPlayMs = Date.now() - t0;
    ok(launchAt === null || (launchAt - s.origin) % bar === 0, 'the clip was queued for a bar line: sample ' + launchAt);
    // 2. the knob: a low-pass on the clip for a while
    await sleep(600); send('pad-fx', { slot: 'a', fx: -0.9 }); await sleep(600); send('pad-fx', { slot: 'a', fx: 0 });
    // 3. a held note, then the heavy preset preloaded in the twin (0.15 s state load) and switched on the beat
    send('launch', { slot: 'a', mode: 'stop', at: 'now' }); await until(async () => (await V('set-status')).pads.a.state === 'stopped', 2000, 'the clip to stop');
    await V('midi', { note: 69, on: true, velocity: 100 }); await sleep(300);
    const before = (await V('live-status')).underruns; t0 = Date.now();
    const pre = await V('preset-preload', { id: 'loud', state: loud }); out.timings.preloadMs = Date.now() - t0;
    ok(pre.preloaded === 'loud' && pre.loadMs >= 150, `the preset loads in the twin (${pre.loadMs} ms, off the audio thread)`);
    const sw = await V('preset-switch', { id: 'loud', at: 'beat' }); s = await V('set-status');
    ok((sw.switchAt - s.origin) % 24000 === 0, `the switch is set for a beat line (bar ${sw.bar}, beat ${sw.beat})`);
    s = await until(async () => { const x = await V('set-status'); return x.current === 'loud' && x; }, 3000, 'the switch');
    const swap = s.swaps.at(-1); ok(swap.at === sw.switchAt && swap.id === 'loud', 'it happened at exactly that sample');
    await sleep(400); const afterSwitch = (await V('live-status')).underruns;
    ok(afterSwitch === before, `no underrun while the heavy preset loaded and switched (${before} → ${afterSwitch})`);
    ok((await V('values', { keys: ['level'] })).values.level.value === .9 && s.twin === null, 'the live instrument now plays "Loud"; the old one waits as the twin');
    await V('midi', { note: 69, on: false });
    // the desk's own way (state set on the live instance) with the same heavy preset: the audio thread waits → underruns
    const deskBefore = (await V('live-status')).underruns; await V('snapshot', { state: loud }); await sleep(200);
    const deskAfter = (await V('live-status')).underruns; out.timings.deskWayUnderruns = deskAfter - deskBefore;
    ok(deskAfter > deskBefore, `control: loading it on the live instance instead costs ${deskAfter - deskBefore} underrun(s): the twin is what makes the switch gapless`);
    // 4. panic: everything fades out, the clip stops, the transport keeps running
    send('launch', { slot: 'a', mode: 'play', at: 'beat' }); await V('midi', { note: 72, on: true, velocity: 100 });
    await until(async () => (await V('set-status')).pads.a.state === 'playing', 2000, 'the clip again'); await sleep(200);
    t0 = Date.now(); send('set-panic', { fade: .3 });
    s = await until(async () => { const x = await V('set-status'); return !x.panic && x.pads.a.state === 'stopped' && x; }, 3000, 'the panic fade'); out.timings.panicMs = Date.now() - t0;
    ok(s.open && s.playing, 'panic: the clip stopped, the stream and transport keep running');
    await sleep(400);
    // 5. the run: the WAV + its log
    const r = await V('run-stop'); ok(fs.existsSync(r.path) && !fs.existsSync(r.path + '.part') && path.dirname(r.path) === path.join(dir, 'creative-live', 'Test set'), 'the run is written whole in the set\'s folder: ' + path.basename(r.path));
    const w = wavOf(r.path), L = w.channels[0], ev = k => r.events.filter(e => e.kind === k);
    ok(Math.abs(r.seconds - L.length / rate) < 1e-6 && r.seconds > 3 && r.levels.length >= 1 && !r.silent, `${r.seconds.toFixed(2)} s recorded, levels kept`);
    const la = ev('launch')[0], sx = ev('switch')[0], pa = ev('panic')[0];
    ok(la && sx && pa && sx.bar >= la.bar, 'the log: launch, switch, panic with their bars');
    let first = la.sample; while (first < L.length && Math.abs(L[first]) < 1e-3) first++;
    ok(first - la.sample <= 2, `the clip starts in the recording at the bar's exact sample (+${first - la.sample})`);
    const [fxOn, fxOff] = ev('fx'); ok(fxOn?.filter === 'low' && fxOff?.filter === 'off', 'the knob\'s on / off are in the log');
    const open1 = rms(L, la.sample + 2400, fxOn.sample - 2400), filtered = rms(L, fxOn.sample + 4800, fxOff.sample - 2400);
    ok(filtered < open1 * .5, `the knob filtered the clip (RMS ${open1.toFixed(3)} → ${filtered.toFixed(3)})`);
    // around the switch: the held note goes from level 0.5 to 0.9 across a 256-sample crossfade, at its sample
    const pre1 = rms(L, sx.sample - 4800, sx.sample - 2400) , post1 = rms(L, sx.sample + 2400, sx.sample + 4800);
    ok(pre1 > .01 && Math.abs(post1 / (pre1) - 1.8) < 0.45, `the held note carried over to the new preset at the switch (×${(post1 / pre1).toFixed(2)}, level 0.5 → 0.9)`);
    const tail = rms(L, pa.sample + Math.round(.3 * rate) + 960, Math.min(L.length, pa.sample + Math.round(.3 * rate) + 9600));
    ok(rms(L, pa.sample - 4800, pa.sample) > .05, 'the clip and a held note were sounding when panic was pressed');
    ok(tail < 1e-3, `after the panic fade the run is silent (RMS ${tail.toExponential(1)})`);
    // 6. closing the set frees the twin and the clips; the host goes back to the plain path
    ok((await V('set-close')).closed && !(await V('set-status')).open, 'set-close: idle again (no clips, no twin)');
    out.host = 'quantized launch / knob / twin preload + beat switch (no underrun) / held note carried / panic / run recorder passed';
  } catch (err) { console.error(err); process.exitCode = 1; out.error = err.message; }
  finally { try { host?.stop(); } catch { /* gone */ } await sleep(100); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(JSON.stringify(out, null, 1));
})();
