// (round 69, midilearn69) 🎹 Map my controller, without a controller or the real plugins:
//   1. the window's pure part (tools/midilearn-core.js): the main process's field whitelist, add / remove / range /
//      invert, the words shown;
//   2. the host's mapping math and its MidiMap class (dev/midilearn69-test.py on creative-vst-midimap.py): range,
//      invert, takeover / jump pickup, smoothing, learn, the touched control, files;
//   3. the REAL creative-vst-host.py through creative-vstmain.js's pool, with dev/fixtures/fake-vst-py (a sine 'Vital',
//      a 'Fake Keys' controller that plays what this test appends to FAKE_MIDI_INBOX): learn a knob, map it, move it,
//      pitch bend / mod wheel untouched, the touched control, mappings back after a host restart, Serum 2 kept apart.
//   node dev/midilearn69-test.js        (needs python3 + numpy for parts 2–3; says "skipped" plainly when missing)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const K = require('../tools/midilearn-core.js');
const { pool, jobOf } = require('../creative-vstmain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(25); } };
const out = { pass: false, checks: [], skipped: [], timings: {} }, ok = (v, msg) => { assert.ok(v, msg); out.checks.push(msg); };

// ---- 1. the window's pure part
ok(jobOf({ action: 'midimap-set', plugin: 'x', maps: [{ cc: 21, ch: 0, key: 'cutoff', label: 'Cutoff', min: .1, max: .9, invert: true, extra: 1 }], pickup: 'jump', learn: 'yes' }, 'Vital').maps[0].extra === undefined, 'whitelist: a mapping keeps only its known fields');
const j = jobOf({ action: 'midimap-learn', plugin: 'x', learn: true, pickup: 'odd' }, 'Vital'); ok(j.learn === true && j.pickup === 'takeover', 'whitelist: learn is a boolean, an unknown pickup is Take over');
ok(!('maps' in jobOf({ action: 'live-status', plugin: 'x' }, 'Vital')), 'whitelist: other actions carry no mapping fields');
for (const [bad, why] of [[{ cc: 1, key: 'a' }, 'mod wheel'], [{ cc: 64, key: 'a' }, 'sustain'], [{ cc: 200, key: 'a' }, 'CC 200'], [{ cc: 21, key: '' }, 'no control'], [{ cc: 21, key: 'a', max: 2 }, 'range over 100 %'], [{ cc: 21, ch: 16, key: 'a' }, 'channel 17']])
  ok((() => { try { jobOf({ action: 'midimap-set', plugin: 'x', maps: [bad] }, 'Vital'); return false; } catch { return true; } })(), 'whitelist refuses: ' + why);
assert.throws(() => jobOf({ action: 'midimap-set', plugin: 'x', maps: Array(65).fill({ cc: 21, key: 'a' }) }, 'Vital'), /64/); out.checks.push('whitelist: 64 mappings at most');
let maps = K.add([], { cc: 21, ch: 0, key: 'cutoff', label: 'Filter cutoff' }); maps = K.add(maps, { cc: 21, ch: 0, key: 'cutoff', label: 'Filter cutoff' }); maps = K.add(maps, { cc: 22, ch: 0, key: 'level', label: 'Level' });
ok(maps.length === 2 && maps[0].min === 0 && maps[0].max === 1 && maps[0].invert === false, 'add: full range, not inverted; the same knob → control again is not doubled');
ok(/mod wheel/.test((() => { try { K.add([], { cc: 1, key: 'x' }); } catch (e) { return e.message; } })()), 'add: the mod wheel is refused in plain words');
maps = K.setRange(maps, 0, { min: '25', max: 140 }); ok(maps[0].min === .25 && maps[0].max === 1, 'range: percent in, clamped to 0–100 %');
maps = K.setInvert(maps, 1, true); ok(maps[1].invert === true && maps[0].invert === false, 'invert one row');
ok(K.remove(maps, 0).length === 1 && K.remove(maps, 0)[0].key === 'level', 'remove a row');
ok(K.rowText(maps[0]) === 'CC 21 → Filter cutoff', 'a row reads "CC 21 → Filter cutoff"');
ok(/picks up when the knob reaches it/.test(K.rowState({ value: .7, picked: false }, 'takeover')) && K.rowState({ value: .7, picked: true }, 'takeover') === 'now 70 %' && K.rowState({ value: .7, picked: false }, 'jump') === 'now 70 %', 'the line under a row: where it is, and Take over waiting');
ok(K.learnText({ cc: null }, 'Vital') === 'Turn a knob or move a fader on your controller…' && /Got CC 74 · ch 3/.test(K.learnText({ cc: 74, ch: 2 }, 'Vital')) && /the mod wheel/.test(K.learnText({ cc: null, ignored: 'the mod wheel' })), 'learn words');
ok(K.search([{ key: 'filter_1_cutoff', label: 'Filter 1 Cutoff' }, { key: 'reverb_mix', label: 'Reverb Mix' }], 'cut filt').length === 1 && K.label({ label: 'Level (0–1)' }) === 'Level', 'search by words; labels without "(0–1)"');

// ---- 2 + 3 need python3 with numpy
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('host parts: python3 with numpy not found here'); out.pass = true; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-midilearn69-'));
const unit = spawnSync(PY, ['-I', path.join(__dirname, 'midilearn69-test.py'), path.join(__dirname, '..'), temp], { encoding: 'utf8', timeout: 60000 });
if (unit.status !== 0) { console.error(unit.stdout, unit.stderr); process.exit(1); }
const u = JSON.parse(unit.stdout.trim().split('\n').pop()); assert.ok(u.pass); out.checks.push(...u.checks.map(c => 'host math: ' + c));

(async () => {
  const root = path.join(temp, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true }); fs.mkdirSync(path.join(root, 'Serum2.vst3'));
  const pbLog = path.join(temp, 'midi.jsonl'), inbox = path.join(temp, 'inbox.jsonl'); fs.writeFileSync(inbox, '');
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), FAKE_PB_LOG: pbLog, FAKE_MIDI_NOTE: '0', FAKE_MIDI_INBOX: inbox, PYTHONDONTWRITEBYTECODE: '1' });
  const send = (...items) => fs.appendFileSync(inbox, items.map(x => JSON.stringify(x) + '\n').join(''));
  let host;
  try {
    host = pool({ dataDir: temp, python: PY, roots: [root] });
    const [serum, vital] = host.scan().plugins;
    const V = (action, extra = {}) => host.request({ action, plugin: vital.path, name: 'Vital', ...extra });
    const value = async key => (await V('values', { keys: [key] })).values[key].value;
    const opened = await V('open', { live: true, buffer: 128, gain: .1, midiIn: 'all' }); assert.ok(opened.ok, opened.error);
    await until(async () => (await V('live-status')).midi.open.includes('Fake Keys'), 4000, 'controller open'); await sleep(100);
    let st = await V('midimap-status'); ok(st.ok && st.instrument === 'Vital' && st.maps.length === 0 && st.listening, 'host: no mappings yet, the controller listened to');
    // learn: the mod wheel is named, the next knob is learned
    let t0 = Date.now(); st = await V('midimap-learn', { learn: true }); ok(st.learn && st.learn.cc === null, 'host: Learn armed');
    send([0xB0, 1, 40]); await until(async () => (await V('midimap-status')).learn.ignored === 'the mod wheel', 3000, 'mod wheel named');
    send([0xB1, 21, 30]); st = await until(async () => { const s = await V('midimap-status'); return s.learn.cc === 21 && s; }, 3000, 'CC 21 learned');
    out.timings.learnMs = Date.now() - t0; ok(st.learn.ch === 1, 'host: turning a knob is learned (CC 21 on channel 2)');
    // the control touched in the plugin's window
    await sleep(400); send({ knob: 'macro_3', value: .66 });
    st = await until(async () => { const s = await V('midimap-status'); return s.touched?.key === 'macro_3' && s; }, 3000, 'touched control');
    ok(st.touched.label === 'Macro 3', 'host: the control turned in the plugin window is offered ("Macro 3")');
    // map CC 21 (ch 2) → cutoff, takeover; cutoff is at 70 %
    st = await V('midimap-set', { maps: [{ cc: 21, ch: 1, key: 'cutoff', label: 'Filter cutoff' }], pickup: 'takeover', learn: false });
    ok(st.ok && st.maps.length === 1 && st.learn === null && fs.existsSync(path.join(temp, 'creative-vst', 'midi-maps', 'Vital.json')), 'host: mapping saved in <data>/creative-vst/midi-maps/Vital.json');
    fs.writeFileSync(pbLog, '');
    send([0xB1, 21, 0]); await sleep(250);
    ok(Math.abs(await value('cutoff') - .7) < 1e-6, 'host: Take over — the knob at 0 leaves the cutoff at 70 % (no jump)');
    send([0xB1, 21, 80], [0xB1, 21, 100]); // 63 % → 79 %: passes 70 %
    await until(async () => Math.abs(await value('cutoff') - 100 / 127) < 1e-4, 3000, 'cutoff follows'); ok(true, 'host: the knob passing the cutoff picks it up; it follows the knob');
    t0 = Date.now(); send([0xB1, 21, 127]); await until(async () => Math.abs(await value('cutoff') - 1) < 1e-4, 3000, 'cutoff to 100 %'); out.timings.knobToValueMs = Date.now() - t0;
    send([0xE1, 0, 90], [0xB1, 1, 100], [0x91, 60, 90], [0x81, 60, 0]);
    await sleep(300);
    const log = fs.readFileSync(pbLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).msg);
    ok(log.some(m => m[0] === 0xE1 && m[2] === 90) && log.some(m => m[0] === 0xB1 && m[1] === 1 && m[2] === 100) && log.some(m => m[0] === 0x91 && m[1] === 60), 'host: pitch bend, the mod wheel and notes reach the plugin untouched');
    ok(!log.some(m => m[0] === 0xB1 && m[1] === 21), 'host: the mapped knob\'s CC is taken, not sent to the plugin');
    st = await V('midimap-status'); ok(st.maps[0].picked === true && st.taken >= 2 && Math.abs(st.maps[0].value - 1) < 1e-4, 'host: status rows show the live value and pickup');
    // the desk moves the cutoff: takeover waits for the knob again; jump follows at once
    assert.ok((await V('patch', { parameters: { cutoff: .3 } })).ok);
    send([0xB1, 21, 120]); await sleep(250); ok(Math.abs(await value('cutoff') - .3) < 1e-6, 'host: moved elsewhere, the knob must reach it again');
    await V('midimap-set', { maps: [{ cc: 21, ch: 1, key: 'cutoff', label: 'Filter cutoff', min: .2, max: .6, invert: true }], pickup: 'jump' });
    send([0xB1, 21, 127]); await until(async () => Math.abs(await value('cutoff') - .2) < 1e-4, 3000, 'jump + invert + range'); ok(true, 'host: Jump + invert + 20–60 % range: knob up → 20 %');
    send([0xB1, 21, 0]); await until(async () => Math.abs(await value('cutoff') - .6) < 1e-4, 3000, 'knob down'); ok(true, 'host: knob down → 60 %');
    // Serum 2's mappings are its own; Vital's come back after the host restarts
    const S = (action, extra = {}) => host.request({ action, plugin: serum.path, name: 'Serum 2', ...extra });
    assert.ok((await S('open', { live: false })).ok); ok((await S('midimap-status')).maps.length === 0, 'host: Serum 2 has its own (empty) mappings');
    host.stop(); await sleep(300);
    host = pool({ dataDir: temp, python: PY, roots: [root] }); host.scan();
    assert.ok((await V('open', { live: false })).ok);
    st = await V('midimap-status'); ok(st.maps.length === 1 && st.maps[0].min === .2 && st.maps[0].invert === true && st.pickup === 'jump', 'host: Vital\'s mappings and pickup are back after a restart');
    out.pass = true;
    console.log(JSON.stringify(out, null, 1));
  } finally { host?.stop(); await sleep(200); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
