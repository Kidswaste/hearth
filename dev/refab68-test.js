// (round 68, refab68) 🎧 Reference A/B, without a sound card:
//   1. K-weighting (tools/refab-core.js): the BS.1770 coefficients at 48 kHz, the curve's shape, other sample rates;
//   2. integrated loudness against EBU Tech 3341's cases (generated stereo 1 kHz sines, the gates), mono = dual mono,
//      silence / too short, white noise 6 dB down reads 6 LU less;
//   3. level matching: the louder one turned down (never a boost), the words, and both re-measured equal after the gain;
//   4. the loop region (the loudest 15 s found, handles clamped), the tone balance and its words;
//   5. the desk's output among the window's outputs (pickSink), the small formatters;
//   6. the main side (refabmain.js): the scratch path in the temp folder, never the sketches folder;
//   7. 'sketch-peek' through the real instrument host (fake Pedalboard / sounddevice; python3 + numpy, else skipped).
//   node dev/refab68-test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const K = require('../tools/refab-core.js'), M = require('../refabmain.js'), P = require('../tools/parkjam-core.js');
const out = { checks: 0, skipped: [] }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RATE = 48000;
const sine = (dbfs, sec, hz = 1000, rate = RATE) => { const n = Math.round(sec * rate), a = 10 ** (dbfs / 20), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * hz * i / rate); return x; };
const cat = (...xs) => { const n = xs.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let at = 0; for (const x of xs) { o.set(x, at); at += x.length; } return o; };
const lufsOf = (chs, rate = RATE) => K.integrated(K.analyze(chs, rate));
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const noise = (sec, amp = 0.5) => { const x = new Float32Array(Math.round(sec * RATE)); for (let i = 0; i < x.length; i++) x[i] = rnd() * 2 * amp; return x; };
const scaled = (x, g) => x.map(v => v * g);

// ---- 1. K-weighting
const [shelf, cut] = K.kWeights(48000);
ok(near(shelf.b0, 1.53512485958697, 1e-9) && near(shelf.b1, -2.69169618940638, 1e-9) && near(shelf.b2, 1.19839281085285, 1e-9) && near(shelf.a1, -1.69065929318241, 1e-9) && near(shelf.a2, 0.73248077421585, 1e-9), 'the high shelf at 48 kHz has the BS.1770 table\'s coefficients');
ok(cut.b0 === 1 && cut.b1 === -2 && cut.b2 === 1 && near(cut.a1, -1.99004745483398, 1e-9) && near(cut.a2, 0.99007225036621, 1e-9), 'the low cut at 48 kHz has the BS.1770 table\'s coefficients');
const kdb = (hz, rate = 48000) => { const [a, b] = K.kWeights(rate); return 20 * Math.log10(K.response(a, hz, rate) * K.response(b, hz, rate)); };
ok(near(kdb(1000), 0.69, 0.05) && near(kdb(10000), 4.0, 0.3) && kdb(20) < -10 && near(kdb(100), -1.1, 0.3), `the K curve: ≈ +0.7 dB at 1 kHz (−0.691 cancels it), ≈ +4 dB above 5 kHz, a low cut (100 Hz ≈ −1.1 dB, 20 Hz ${kdb(20).toFixed(1)} dB)`);
ok(near(kdb(1000, 44100), kdb(1000), 0.02) && near(kdb(10000, 96000), kdb(10000), 0.1), 'the same curve at 44.1 and 96 kHz (coefficients made for the rate)');

// ---- 2. loudness: EBU Tech 3341 cases with generated stereo 1 kHz sines
const st = x => [x, x];
let L = lufsOf(st(sine(-23, 20))); ok(near(L, -23, 0.1), `case 1: a stereo 1 kHz sine at −23 dBFS reads −23.0 LUFS (${L.toFixed(2)})`);
L = lufsOf(st(sine(-33, 20))); ok(near(L, -33, 0.1), `case 2: at −33 dBFS reads −33.0 LUFS (${L.toFixed(2)})`);
L = lufsOf(st(cat(sine(-36, 10), sine(-23, 60), sine(-36, 10)))); ok(near(L, -23, 0.1), `case 3: 10 s at −36, 60 s at −23, 10 s at −36 → −23.0 (the relative gate drops the quiet parts) (${L.toFixed(2)})`);
L = lufsOf(st(cat(sine(-72, 10), sine(-36, 10), sine(-23, 60), sine(-36, 10), sine(-72, 10)))); ok(near(L, -23, 0.1), `case 4: with −72 dBFS ends too (the absolute gate) → −23.0 (${L.toFixed(2)})`);
L = lufsOf(st(cat(sine(-26, 20), sine(-20, 20.1), sine(-26, 20)))); ok(near(L, -23, 0.1), `case 5: −26 / −20 / −26 → −23.0 (${L.toFixed(2)})`);
L = lufsOf(st(sine(-23, 20, 1000, 44100)), 44100); ok(near(L, -23, 0.1), `a 44.1 kHz file measures the same (${L.toFixed(2)})`);
ok(near(lufsOf([sine(-23, 10)]), lufsOf(st(sine(-23, 10))), 1e-6), 'a mono file counts as both speakers (dual mono: same as the same sound in stereo)');
ok(lufsOf(st(new Float32Array(10 * RATE))) === null && lufsOf(st(sine(-20, 0.3))) === null && lufsOf(st(sine(-80, 10))) === null, 'silence, under one 400 ms block, or all below −70 LUFS: null ("too quiet to measure")');
const nz = noise(20), n1 = lufsOf([nz, noise(20)]); seed = 7; const nzq = scaled(noise(20), 0.5), n2 = lufsOf([nzq, scaled(noise(20), 0.5)]);
ok(near(n1 - n2, 20 * Math.log10(2), 0.01), `white noise 6.02 dB down reads 6.02 LU less (${(n1 - n2).toFixed(3)})`);
let t0 = Date.now(); const big = K.analyze(st(noise(60)), RATE); out.msPerMinute = Date.now() - t0;
ok(big.ms.length === 600 && big.low.length === 600 && Number.isFinite(K.integrated(big)), `one pass keeps 600 steps of 100 ms for a minute (${out.msPerMinute} ms for a stereo minute)`);

// ---- 3. level matching
let m = K.match(-14, -8); ok(m.refDb === -6 && m.yoursDb === 0 && m.level === -14 && m.diff === 6, 'the reference 6 dB louder: it is turned down 6 dB, yours untouched');
m = K.match(-9, -12.5); ok(m.yoursDb === -3.5 && m.refDb === 0 && m.level === -12.5, 'yours louder: yours is turned down, the reference untouched (never a boost, nothing clips)');
ok(K.match(null, -8) === null && K.match(-14, NaN) === null, 'one of them unmeasurable: no matching');
ok(/the reference plays 6\.0 dB quieter, so both sit at ≈ −14\.0 LUFS/.test(K.matchText(K.match(-14, -8))) && /yours plays 3\.5 dB quieter/.test(K.matchText(K.match(-9, -12.5))) && /already sit/.test(K.matchText(K.match(-10, -10.02))) && /Not level-matched/.test(K.matchText(null)), 'the words: who is turned down, by how many dB, to what loudness (a true minus sign)');
const yours = st(scaled(noise(15), 0.1)), ref = st(sine(-6, 15, 440)), ly = lufsOf(yours), lr = lufsOf(ref); m = K.match(ly, lr);
const after = [lufsOf(yours.map(c => scaled(c, K.dbToGain(m.yoursDb)))), lufsOf(ref.map(c => scaled(c, K.dbToGain(m.refDb))))];
ok(near(after[0], after[1], 0.05) && near(after[1], m.level, 0.05), `after the gain both measure the same: ${after.map(v => v.toFixed(2)).join(' / ')} LUFS (was ${ly.toFixed(1)} / ${lr.toFixed(1)})`);

// ---- 4. the loop region and the tone balance
const track = st(cat(scaled(noise(30), 0.05), scaled(noise(15), 0.5), scaled(noise(20), 0.05))), tr = K.analyze(track, RATE, { width: 500 }), lo = K.loudest(tr);
ok(near(lo.start, 30, 0.15) && near(lo.end - lo.start, 15, 1e-9), `the loudest 15 s is found (the loud part at 30–45 s): ${lo.start.toFixed(1)}–${lo.end.toFixed(1)} s`);
ok(K.integrated(tr, lo.start, lo.end) > K.integrated(tr) && near(K.integrated(tr, 30, 45), lufsOf(st(scaled(noise(15), 0.5))), 0.3), 'a region\'s loudness comes from the kept steps (the loud part alone ≈ that noise on its own)');
ok(tr.peaks.length === 500 && tr.peaks[300] > tr.peaks[100] * 5, 'waveform peaks: one per column, the loud part taller');
const short = K.analyze(st(noise(10)), RATE); ok(K.loudest(short).start === 0 && near(K.loudest(short).end, 10, 1e-9), 'a track not much longer than 15 s: the whole of it');
let r = K.region(5, 2, 60); ok(r.start === 2 && r.end === 5, 'handles crossed: swapped'); r = K.region(10, 10.2, 60); ok(near(r.end - r.start, 1, 1e-9), 'at least 1 s'); r = K.region(-4, 99, 60); ok(r.start === 0 && r.end === 60, 'never outside the track'); r = K.region(59.8, 60, 60); ok(r.end === 60 && r.start === 59, 'a 1 s loop at the very end moves back');
const tri = (a, b, c) => { const n = 10 * RATE, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * 60 * i / RATE) + b * Math.sin(2 * Math.PI * 1000 * i / RATE) + c * Math.sin(2 * Math.PI * 10000 * i / RATE); return st(x); };
const tRef = K.tone(K.analyze(tri(0.3, 0.3, 0.3), RATE)), tYou = K.tone(K.analyze(tri(0.3 * 10 ** (-4 / 20), 0.3, 0.3), RATE)), cmp = K.compare(tYou, tRef), low = cmp.rows[0];
ok(low.id === 'low' && low.diff < -2.5 && low.diff > -3.6 && /^Your low end is 3 dB lighter than the reference\.$/.test(low.words), `the low end 4 dB down (≈ 3 dB of the balance once shares are compared): "${low.words}"`);
ok(/about the same/.test(cmp.rows[1].words) && /about the same/.test(cmp.rows[2].words) && cmp.first === low.words, 'mids and top about the same; the biggest difference is said first');
const c2 = K.compare({ low: -4, mid: -3, high: -9 }, { low: -0, mid: -3.5, high: -14 });
ok(c2.rows[0].words === 'Your low end is 4 dB lighter than the reference.' && c2.rows[1].words === 'Your mids are about the same as the reference.' && c2.rows[2].words === 'Your top end is 5 dB brighter than the reference.' && c2.first === c2.rows[2].words, 'plain words: "your low end is 4 dB lighter", "your top end is 5 dB brighter"');
ok(K.compare({ low: -1, mid: -3, high: -5 }, { low: -1.2, mid: -2.5, high: -5.4 }).first === 'Your tone balance is close to the reference.' && K.compare(null, tRef) === null && K.tone(K.analyze(st(new Float32Array(RATE)), RATE)) === null, 'close everywhere: said so; nothing measured: no comparison');

// ---- 5. the desk's output device, formatters
const outs = [{ deviceId: 'default', label: 'Default - Speakers (Universal Audio Volt 2)' }, { deviceId: 'rt', label: 'Speakers (Realtek(R) Audio)' }, { deviceId: 'ua', label: 'Speakers (Universal Audio Volt 2)' }, { deviceId: 'hd', label: 'LG HDR 4K (NVIDIA High Definition Audio)' }];
ok(K.pickSink('Universal Audio Volt 2 (ASIO)', outs) === 'ua' && K.pickSink('Volt 2', outs) === 'ua', 'the desk\'s "Universal Audio Volt 2 (ASIO)" → the window\'s "Speakers (Universal Audio Volt 2)" (never "default")');
ok(K.pickSink('MacBook Pro Speakers', outs) === '' && K.pickSink('', outs) === '' && K.pickSink('Speakers', outs) === '', 'nothing in common, or only generic words: no pick (the default output, said in the panel)');
ok(K.clock(62.44) === '1:02.4' && K.lufsText(-7.94) === '≈ −7.9 LUFS' && K.lufsText(null) === 'too quiet to measure', 'formatters: 1:02.4, ≈ −7.9 LUFS');
ok(['a.wav', 'B.MP3', 'c.flac', 'd.m4a'].every(K.isAudioName) && !K.isAudioName('notes.txt'), 'audio file names: wav / mp3 / flac / m4a');

// ---- 6. main: the scratch path
const dA = fs.mkdtempSync(path.join(os.tmpdir(), 'refab68-')), pA = M.peekPath(dA), pB = M.peekPath(path.join(dA, 'other'));
ok(pA.startsWith(os.tmpdir()) && path.basename(pA) === 'desk-now.wav' && fs.existsSync(path.dirname(pA)) && pA === M.peekPath(dA) && pA !== pB && !pA.includes('creative-sketches'), 'the desk\'s scratch copy goes in the temp folder, one per Hearth data folder, never in the sketches folder');

// ---- 7. 'sketch-peek' through the real instrument host
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
const done = () => { fs.rmSync(dA, { recursive: true, force: true }); console.log(JSON.stringify(out, null, 1)); };
if (py.status !== 0) { out.skipped.push('sketch-peek in the host: python3 with numpy not found here'); done(); } else (async () => {
  const { pool } = require('../creative-vstmain');
  const root = path.join(dA, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true });
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_MIDI_NOTE: '0' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  try {
    host = pool({ dataDir: dA, python: PY, roots: [root] }); assert.ok((await host.status()).ok);
    const vital = host.scan().plugins.find(p => p.name === 'Vital');
    const V = async (action, extra = {}) => { const x = await host.request({ action, plugin: vital.path, name: 'Vital', ...extra }); if (!x.ok) throw Error(action + ': ' + x.error); return x; };
    await V('open', { live: true, device: 4, buffer: 512, gain: .2 }); await sleep(500);
    const silent = await host.request({ action: 'sketch-peek', plugin: vital.path, name: 'Vital' });
    ok(!silent.ok && /silent for the last 30 seconds: play something, then measure again/.test(silent.error), `a silent desk: "${silent.error}"`);
    await V('midi', { note: 69, on: true, velocity: 100 }); await sleep(1500); await V('midi', { note: 69, on: false }); await sleep(200);
    const pk = await V('sketch-peek', { output: '/etc/evil.wav', project: 'Sunday' });
    ok(pk.path === pA && fs.existsSync(pA) && !fs.existsSync(pA + '.part'), 'sketch-peek writes the scratch path main made (a path from the window is ignored), whole');
    ok(!fs.existsSync(path.join(dA, 'creative-sketches')), 'nothing lands in the sketches folder (a peek is not a sketch)');
    const st2 = await V('sketch-status'); ok(st2.saved === 0, 'and it is not counted as a saved sketch');
    const b = fs.readFileSync(pA), w = P.decodeWav(new Uint8Array(b.buffer, b.byteOffset, b.length)), l = K.integrated(K.analyze(w.channels, w.rate));
    ok(w.rate === 48000 && w.channels.length === 2 && Number.isFinite(l) && l < 0 && l > -60, `the desk's last ${pk.seconds.toFixed(1)} s, 48 kHz stereo, measures ${K.lufsText(l)}`);
    const pk2 = await V('sketch-peek'); ok(pk2.path === pA, 'measuring again overwrites the same scratch file');
    out.host = 'sketch-peek: silence refused, the main-made scratch path, not a sketch, measurable';
  } catch (err) { console.error(err); process.exitCode = 1; out.error = err.message; }
  finally { try { host?.stop(); } catch { /* gone */ } await sleep(100); done(); }
})();
