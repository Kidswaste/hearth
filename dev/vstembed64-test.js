// (round 64, vstembed64) 48 kHz everywhere, a faster instrument load, the plugin's own editor inside Hearth, silent AI
// tweaks — without Windows, a sound card or the real plugins:
//   1. pure parts: the editor placement geometry, the frame's words, the ✦ Preset line, the main process's field
//      whitelist (the page can't name a window), the VST folder mtime cache, the warm-host session rule, window handles;
//   2. creative-vst-embed.py's Embedder on dev/fixtures/fake-vst-py/fakewin32.py (find → SetParent → place / clip /
//      hide → the plugin moves / resizes itself → pop out → closed), in Python;
//   3. the REAL creative-vst-host.py through creative-vstmain's pool with the fake Pedalboard (shaped like 0.9.26: the
//      wrapper cost at load, the by-name scan) / sounddevice / Win32: 48 kHz live + renders + takes (a 96 kHz-only
//      device: the readout says so, the take is converted once), the control list read once then from disk, the warm
//      host, the editor embedded (parameters set by Hearth show in its window, audio never stops, snapshot / bounce
//      with it open, pop out / back in / close).
//   node dev/vstembed64-test.js     (needs python3 + numpy; says "skipped" plainly when they're missing)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const X = require('../tools/workbench-vst-embed.js'), PH = require('../tools/preset-hover-core.js');
const M = require('../creative-vstmain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(25); } };
const out = { checks: [], skipped: [], timings: {} }, ok = (v, msg) => { assert.ok(v, msg); out.checks.push(msg); };
const FIX = path.join(__dirname, 'fixtures', 'fake-vst-py');

// ---- 1. pure parts
let g = X.geometry({ rect: { left: 100, top: 200, right: 980, bottom: 760 }, clips: [{ left: 0, top: 0, right: 1600, bottom: 1000 }], dpr: 1 });
ok(g.x === 100 && g.y === 200 && g.clip === null && g.visible, 'placement: whole editor on screen → no clip');
g = X.geometry({ rect: { left: 100, top: 200, right: 980, bottom: 760 }, clips: [{ left: 0, top: 0, right: 1600, bottom: 1000 }, { left: 0, top: 300, right: 700, bottom: 900 }], dpr: 1.5 });
ok(g.x === 150 && g.y === 300 && JSON.stringify(g.clip) === JSON.stringify([150, 450, 900, 690]) && g.visible, `placement: scrolled + a narrower desk, at 150 % (clip ${g.clip})`);
ok(!X.geometry({ rect: { left: 100, top: 200, right: 980, bottom: 760 }, covers: [{ left: 500, top: 100, right: 700, bottom: 260 }] }).visible, 'placement: a menu / dialog over it → hidden');
ok(X.geometry({ rect: { left: 100, top: 200, right: 980, bottom: 760 }, covers: [{ left: 1000, top: 100, right: 1200, bottom: 260 }] }).visible, 'placement: a panel elsewhere → still shown');
ok(!X.geometry({ rect: { left: 100, top: 1200, right: 980, bottom: 1760 }, clips: [{ left: 0, top: 0, right: 1600, bottom: 1000 }] }).visible && !X.geometry({ rect: { left: 1, top: 1, right: 9, bottom: 9 }, hidden: true }).visible, 'placement: scrolled out of view / desk hidden → hidden');
ok(JSON.stringify(X.cssSize([1320, 840], 1.5)) === '{"w":880,"h":560}' && X.cssSize(null) === null, 'placeholder takes the editor size in CSS px');
ok(X.words({ mode: 'closed' }, 'Vital').buttons.join() === 'here,pop' && X.words({ mode: 'embedded' }, 'Vital').buttons.join() === 'pop,close' && X.words({ mode: 'floating', note: 'x' }, 'Vital').line === 'x' && X.words({ mode: 'floating', embeddable: false }, 'Vital').buttons.join() === 'close', 'frame buttons: Open editor here / Pop out / Close editor per state, one plain line');
ok(PH.summary('darker and slower') === 'Darker and slower — applied' && PH.summary('a very long description of a sound that goes on and on and on forever').length <= 60, 'the ✦ Preset line: the owner’s words + “— applied”, short');
ok(PH.summary('  brighter!  ') === 'Brighter — applied', 'the ✦ Preset line trims and capitalises');
let j = M.jobOf({ action: 'editor', plugin: 'x', embed: { x: 10.4, y: 20, clip: [1, 2, 3, 4], visible: true, parent: '999' } }, 'Vital');
ok(j.embed.x === 10 && j.embed.parent === undefined && j.embed.clip.join() === '1,2,3,4', 'whitelist: the page gives a position, never a window handle');
ok(M.jobOf({ action: 'snapshot', stateOnly: 'yes' }).stateOnly === undefined && M.jobOf({ action: 'snapshot', stateOnly: true }).stateOnly === true, 'whitelist: stateOnly is a strict flag');
ok(M.windowOf({ isDestroyed: () => false, getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(0x2a0b16n); return b; } }).parent === String(0x2a0b16), 'Hearth’s window handle read from Electron’s 8-byte buffer');
const temp0 = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vstembed-'));
try {
  const root = path.join(temp0, 'VST3'), cache = path.join(temp0, 'scan-cache.json'); fs.mkdirSync(path.join(root, 'Xfer', 'Serum2.vst3'), { recursive: true }); fs.mkdirSync(path.join(root, 'Big', 'Deep', 'Other.vst3'), { recursive: true });
  let a = M.discoverCached([root], cache); ok(!a.cached && a.plugins.map(p => p.name).join() === 'Serum 2', 'VST folders: first scan walks them');
  let b = M.discoverCached([root], cache); ok(b.cached && b.plugins.length === 1, 'VST folders: unchanged → not walked again (mtime cache)');
  fs.mkdirSync(path.join(root, 'Vital.vst3')); const c = M.discoverCached([root], cache); ok(!c.cached && c.plugins.map(p => p.name).join() === 'Serum 2,Vital', 'VST folders: a plugin installed → seen at once');
  // the warm host's rule: never for someone who hasn't used the desk; after a session that used it, yes; not two later
  const data = path.join(temp0, 'data'); let loads = 0;
  ok(M.warmLater(data, () => loads++, 5) === null && !fs.existsSync(path.join(data, 'creative-vst', 'warm.json')), 'warm host: never used → nothing started, nothing written');
  M.noteUse(data, '/p/Vital.vst3', []);
  const w1 = M.warmLater(data, () => loads++, 5); ok(w1 && w1.plugin === '/p/Vital.vst3', 'warm host: used last session → warmed at idle');
  const w2 = M.warmLater(data, () => loads++, 5); ok(w2 === null, 'warm host: not used in the last session → stays cold');
} finally { fs.rmSync(temp0, { recursive: true, force: true }); }
out.pure = 'geometry / frame words / ✦ line / whitelist / scan cache / warm rule passed';

// ---- 2 + 3 need python3 with numpy
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('python parts: python3 with numpy not found here'); console.log(JSON.stringify(out, null, 1)); process.exit(0); }

// ---- 2. the Embedder on the fake Win32 layer
const embedPy = `
import importlib.util, json, os, sys, time
spec = importlib.util.spec_from_file_location('embedding', ${JSON.stringify(path.join(__dirname, '..', 'creative-vst-embed.py'))})
E = importlib.util.module_from_spec(spec); spec.loader.exec_module(E)
import fakewin32 as F
r = {}
layer, why = E.backend(); r['backend'] = type(layer).__name__
em = E.Embedder(layer, why)
F.create(os.getpid(), title='Other app window')  # a window of ours that is not the editor
known = [w['hwnd'] for w in layer.windows(os.getpid())]
h = F.create(os.getpid(), w=880, h=560)
st = em.opened({'parent': '777', 'x': 40, 'y': 300, 'clip': None, 'visible': True}, known)
w = F.snapshot()[h]; r['embedded'] = [st['mode'], st['size'], w['parent'], w['child'], w['x'], w['y'], w['region']]
em.place({'x': 40, 'y': 300, 'clip': [0, 400, 700, 600], 'visible': True}); r['clipped'] = F.snapshot()[h]['region']
em.place({'visible': False}); r['hidden'] = F.snapshot()[h]['region']
em.place({'visible': True, 'clip': None}); r['shown'] = F.snapshot()[h]['region']
F.resize(h, 1100, 700); time.sleep(.5); s2 = em.state(); w = F.snapshot()[h]; r['resized'] = [s2['size'], w['x'], w['y']]
r['pop'] = [em.pop_out()['mode'], F.snapshot()[h]['parent'], F.snapshot()[h]['x']]
r['back'] = [em.embed({'parent': '777', 'x': 10, 'y': 20, 'visible': True})['mode'], F.snapshot()[h]['parent']]
F.destroy(h); time.sleep(.4); r['closed'] = em.state()['mode']
bad = E.Embedder(layer, why); h2 = F.create(os.getpid()); r['refused'] = bad.opened({'parent': 13, 'x': 0, 'y': 0}, [w['hwnd'] for w in layer.windows(os.getpid()) if w['hwnd'] != h2])
none = E.Embedder(None, 'this system can not'); r['none'] = none.opened({'parent': '1', 'x': 0, 'y': 0})
print(json.dumps(r))
`;
const er = spawnSync(PY, ['-c', embedPy], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: FIX, HEARTH_VST_FAKE_WIN32: '1', PYTHONDONTWRITEBYTECODE: '1' } });
if (er.status !== 0) throw Error('embedder script failed: ' + er.stderr);
const E2 = JSON.parse(er.stdout.trim().split('\n').pop());
ok(E2.backend === 'Backend', 'the fake Win32 layer is picked with HEARTH_VST_FAKE_WIN32=1');
ok(JSON.stringify(E2.embedded) === JSON.stringify(['embedded', [880, 560], 777, true, 40, 300, null]), `the editor window found by title, made a child of Hearth’s window, placed at the placeholder (${JSON.stringify(E2.embedded)})`);
ok(JSON.stringify(E2.clipped) === JSON.stringify([0, 100, 660, 460]), `scrolled: only the part on screen shows (region ${E2.clipped})`);
ok(Array.isArray(E2.hidden) && E2.hidden.length === 0 && E2.shown === null, 'hidden = an empty region (the window stays open), shown again whole');
ok(JSON.stringify(E2.resized) === JSON.stringify([[1100, 700], 40, 300]), 'the plugin resized / moved its own window → new size noted, put back on the placeholder');
ok(E2.pop[0] === 'floating' && E2.pop[1] === 0 && E2.back[0] === 'embedded' && E2.back[1] === 777, 'Pop out gives the window back; Open editor here takes it again');
ok(E2.closed === 'closed', 'the window closed → the frame knows');
ok(E2.refused.mode === 'floating' && /Couldn.t place the editor inside Hearth/.test(E2.refused.note), `SetParent refused → floating, one plain line (“${E2.refused.note}”)`);
ok(E2.none.mode === 'floating' && /this system can not/.test(E2.none.note), 'no window layer (Linux / Mac without pyobjc) → floating, says why');

// ---- 3. the real host
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vstembed-host-'));
  const root = path.join(temp, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3', 'Contents', 'x86_64-linux'), { recursive: true }); fs.writeFileSync(path.join(root, 'Vital.vst3', 'Contents', 'x86_64-linux', 'Vital.so'), 'v1'); fs.mkdirSync(path.join(root, 'Serum2.vst3'));
  Object.assign(process.env, { PYTHONPATH: FIX, FAKE_PB_PARAMS: '400', FAKE_PB_WRAP_MS: '2', FAKE_PB_NAME_US: '0.5', FAKE_EDITOR_S: 'hold', HEARTH_VST_FAKE_WIN32: '1', FAKE_MIDI_NOTE: '0', PYTHONDONTWRITEBYTECODE: '1' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  const wavRate = b => Buffer.from(b).readUInt32LE(24);
  try {
    // 3a. cold start: host + imports, the plugin loads WITHOUT building every control's wrapper; the list is read in the
    // background (shown as it comes) and kept on disk
    host = M.pool({ dataDir: temp, python: PY, roots: [root] });
    let t0 = Date.now(); const status = await host.status(); ok(status.ok, 'host up'); out.timings.hostStartMs = Date.now() - t0;
    const plugins = host.scan().plugins, vital = plugins.find(p => p.name === 'Vital');
    const V = (action, extra = {}) => host.request({ action, plugin: vital.path, name: 'Vital', ...extra });
    const devices = await V('devices'), asio = devices.devices.find(d => d.api === 'ASIO').id;
    t0 = Date.now(); const opened = await V('open', { live: true, device: asio, buffer: 128, gain: .2 }); out.timings.coldOpenToLiveMs = Date.now() - t0;
    ok(opened.ok && opened.playing && opened.sampleRate === 48000, `open → live at 48 kHz in ${out.timings.coldOpenToLiveMs} ms (the 400 × 2 ms wrapper build is not paid at load)`);
    ok(out.timings.coldOpenToLiveMs < 700, 'the load no longer waits for every control (would be ≥ 800 ms here)');
    let first = await V('controls'); ok(first.ok && first.ready === false && first.built < first.count, `controls arrive as they are read (${first.built} of ${first.count} at once)`);
    const full = await until(async () => { const r = await V('controls'); return r.ready && r; }, 8000, 'controls ready'); out.timings.coldControlsMs = Date.now() - t0;
    ok(full.source === 'read' && full.parameters.length === full.count && full.parameters.find(p => p.key === 'level').max === 1, `controls ready (read once) in ${out.timings.coldControlsMs} ms`);
    const cacheDir = path.join(temp, 'creative-vst', 'controls-cache'); await until(() => fs.existsSync(cacheDir) && fs.readdirSync(cacheDir).some(f => f.endsWith('.json')), 3000, 'cache file');
    ok(true, 'the control list is kept on disk per plugin version');
    const st = await V('live-status'); ok(st.timings.importMs >= 0 && st.timings.bootMs >= 0 && st.targetRate === 48000 && st.rateNote === '', `timings reported (boot ${st.timings.bootMs} ms, imports ${st.timings.importMs} ms, plugin ${st.timings.pluginMs} ms); 48 kHz, no rate note`);
    // a values read uses the C++ parameters directly (no by-name scan per control)
    t0 = Date.now(); const vals = await V('values', { keys: full.parameters.slice(0, 200).map(p => p.key) }); out.timings.values200Ms = Date.now() - t0; ok(vals.ok && Object.keys(vals.values).length === 200, `200 values in ${out.timings.values200Ms} ms`);
    // 3b. the editor inside Hearth (fake Win32): parent from main, placed, clipped, Hearth's changes show in its window
    let r = await host.request({ action: 'editor', plugin: vital.path, name: 'Vital', parent: '4242', embed: { x: 30, y: 400, visible: true } });
    ok(r.ok && r.editor.mode === 'embedded' && r.editor.size.join() === '880,560' && r.editor.window.parent === 4242 && r.editor.window.child, `editor embedded in Hearth’s window (${JSON.stringify(r.editor.size)})`);
    let before = await V('live-status');
    host.send({ action: 'editor-place', plugin: vital.path, embed: { x: 30, y: 380, clip: [0, 500, 1600, 500], visible: true } });
    await until(async () => { const s = await V('live-status'); return s.editor.window?.y === 380 && JSON.stringify(s.editor.window.region) === JSON.stringify([0, 120, 880, 440]); }, 3000, 'placed + clipped');
    ok(true, 'the placeholder scrolled → the window follows and is clipped to what is on screen');
    await V('patch', { parameters: { level: .33, macro_1: .8 } });
    const shown = await until(async () => { const s = await V('live-status'); const w = s.editor.window; return w && Math.abs((w.shown.level ?? 0) - .33) < 1e-9 && Math.abs((w.shown.macro_1 ?? 0) - .8) < 1e-9 && s; }, 3000, 'the editor to show the new values');
    ok(shown.editor.window.repaints > 0, 'values set by Hearth (the ✦ Preset window / the AI) show in the plugin’s own window (repainted)');
    await sleep(300); const later = await V('live-status');
    ok(later.blocks > before.blocks + 50 && later.playing && later.underruns - before.underruns < 5, `audio kept playing with the editor in Hearth (${later.blocks - before.blocks} blocks, ${later.underruns - before.underruns} underruns)`);
    host.send({ action: 'editor-place', plugin: vital.path, embed: { visible: false } }); await until(async () => { const w = (await V('live-status')).editor.window; return w && Array.isArray(w.region) && !w.region.length; }, 3000, 'hidden'); ok(true, 'hidden while the desk is away / covered (still open)');
    const snap = await V('snapshot', { stateOnly: true }); ok(snap.ok && /^z1:/.test(snap.state) && !snap.parameters, 'a state-only snapshot with the editor open');
    ok((await V('snapshot', { stateOnly: true, state: snap.state })).ok, 'a preset recall with the editor open');
    const bounce = await V('render', { duration: .4, notes: [{ note: 60, time: 0, length: .2 }] });
    ok(bounce.ok && bounce.sampleRate === 48000 && wavRate(Buffer.from(bounce.audio, 'base64')) === 48000 && bounce.parameters.length === full.count, 'a bounce with the editor open: 48 kHz WAV, the controls listed (no reset under the open window)');
    ok((await V('live-status')).editor.mode === 'embedded' && (await V('live-status')).playing, 'after the bounce: still embedded, live again');
    r = await host.request({ action: 'editor-pop', plugin: vital.path }); ok(r.editor.mode === 'floating' && r.editor.window.parent === 0, 'Pop out → its own window');
    r = await host.request({ action: 'editor-embed', plugin: vital.path, parent: '4242', embed: { x: 0, y: 0, visible: true } }); ok(r.editor.mode === 'embedded', 'Open editor here → back inside');
    t0 = Date.now(); r = await host.request({ action: 'editor-close', plugin: vital.path }); ok(r.ok && r.editor.mode === 'closed' && Date.now() - t0 < 1500, `Close editor → closed cleanly in ${Date.now() - t0} ms`);
    ok((await V('live-status')).playing && !(await V('live-status')).editorOpen, 'audio unaffected by the editor closing');
    // 3c. 48 kHz files: a park take at 48 kHz as played; a device that refuses 48 kHz → its rate, said, take converted once
    const armed = await V('record', { bars: 1, beats: 2, bpm: 120, wait: 'now' }); if (!armed.ok) throw Error(JSON.stringify(armed)); await until(async () => (await V('record-status')).done, 5000, 'take');
    let take = await V('record-take'); ok(take.ok && take.sampleRate === 48000 && wavRate(take.wav) === 48000 && take.frames === 48000 && take.converted === false, 'a park take: 48 kHz, written as played');
    await V('live-stop'); host.stop(); await sleep(300);
    // 3d. a restart: the list comes from disk (ready at once), the warm host loads the last instrument at idle
    process.env.FAKE_SD_ASIO_96K = '1';
    host = M.pool({ dataDir: temp, python: PY, roots: [root] });
    t0 = Date.now(); const warm = await host.warm(vital.path, []); out.timings.warmMs = Date.now() - t0; ok(warm.ok && warm.loaded, `warm host: started + Vital loaded at idle in ${out.timings.warmMs} ms`);
    t0 = Date.now(); const again = await V('open', { live: true, device: asio, buffer: 128 }); out.timings.warmOpenToLiveMs = Date.now() - t0;
    ok(again.ok && again.playing && again.hostStartMs === undefined, `after the warm-up, a click → live in ${out.timings.warmOpenToLiveMs} ms (no host start, no load)`);
    const cached = await V('controls'); out.timings.cachedControlsMs = Date.now() - t0; ok(cached.ready && cached.source === 'cache' && cached.parameters.length === full.count, `controls ready from the disk list ${out.timings.cachedControlsMs} ms after the click`);
    ok(again.sampleRate === 96000 && /refused 48 kHz, so it plays at 96 kHz/.test(again.rateNote), `a device that refuses 48 kHz plays at its own rate, said plainly (“${again.rateNote}”)`);
    await V('record', { bars: 1, beats: 2, bpm: 120, wait: 'now' }); await until(async () => (await V('record-status')).done, 5000, 'take at 96k');
    take = await V('record-take'); ok(take.sampleRate === 48000 && take.playedRate === 96000 && take.converted && wavRate(take.wav) === 48000 && take.frames === 48000, 'its park take is converted to 48 kHz once, when written (1 s → 48,000 frames)');
    const r96 = await V('render', { duration: .3, notes: [{ note: 60, time: 0, length: .2 }] }); ok(wavRate(Buffer.from(r96.audio, 'base64')) === 48000, 'renders stay 48 kHz whatever the device');
    out.result = `vstembed64: ${out.checks.length} checks passed.`;
    console.log(JSON.stringify(out, null, 1));
  } finally { host?.stop(); delete process.env.FAKE_SD_ASIO_96K; await sleep(250); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
