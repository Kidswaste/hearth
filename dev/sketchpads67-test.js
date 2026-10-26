// (round 67, sketchpads67) Sketches → playable material, without a sound card:
//   1. bar math (tools/sketchpads-core.js): bars and beats in seconds, the BPM field, snapping, the grid, the loop two
//      handles make (start on a beat, whole bars, never past the end), the first loop shown, exact frames;
//   2. the tempo finder on generated click tracks (70–180 BPM, accents, noise, half / double tempo), silence, the beat's
//      phase and the bar's first beat, the phase at a tempo already known;
//   3. the cut (exact length, 3 ms edges, the middle untouched) and the WAV round trip at 48 kHz, the loop's name;
//   4. the main side (sketchpadsmain.js): a NEW file beside the sketch, the sketch byte-for-byte unchanged, its card,
//      never over a file, refusals (outside the sketches folder, not 48 kHz, no tempo), the sketch's loops, every loop
//      as a park take (creative-vstmain's parkList), the Live set's clip guard (liveClip) and the Trash list;
//   5. a sketch loop on a Live set pad (LiveSetCore): a loop pad at the song's tempo plays as is.
//   node dev/sketchpads67-test.js
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
const K = require('../tools/sketchpads-core.js'), P = require('../tools/parkjam-core.js'), L = require('../tools/liveset-core.js');
const M = require('../sketchpadsmain.js'), V = require('../creative-vstmain.js');
const out = { checks: 0 }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---- 1. bar math
ok(K.barSec(120) === 2 && K.barSec(120, 3) === 1.5 && K.beatSec(120) === 0.5 && near(K.barSec(97), 240 / 97), 'a bar of 4/4 at 120 BPM is 2 s, 3/4 is 1.5 s, a beat 0.5 s');
ok(K.parseBpm('128') === 128 && K.parseBpm('97,5') === 97.5 && K.parseBpm(' 140.04 ') === 140 && K.parseBpm('39') === null && K.parseBpm('241') === null && K.parseBpm('fast') === null && K.parseBpm('') === null, 'the BPM field takes 40–240 (a comma works too), anything else is refused');
ok(near(K.snap(3.2, { bpm: 120 }), 3) && near(K.snap(3.3, { bpm: 120 }), 3.5) && near(K.snap(3.2, { bpm: 120, unit: 'bar' }), 4) && near(K.snap(0.9, { bpm: 120, origin: 0.37 }), 0.87), 'snapping to the nearest beat / bar, from the grid\'s origin');
const g = K.grid({ bpm: 120, origin: 0.25, dur: 10 });
ok(g.length === 20 && g[0].t === 0.25 && g[0].bar && !g[1].bar && g[4].bar && g.filter(x => x.bar).length === 5, 'the grid: 20 beats in 10 s at 120 BPM, a bar line every 4');
ok(K.grid({ bpm: 120, origin: 1.25, dur: 4 })[0].t === 0.25 && !K.grid({ bpm: 120, origin: 1.25, dur: 4 })[0].bar, 'a grid starting before its origin: the beats before the first bar line are drawn too');
let p = K.plan({ start: 2.1, end: 9.7, bpm: 120, dur: 30 });
ok(p.start === 2 && p.bars === 4 && p.end === 10 && p.seconds === 8, 'handles at 2.1 s and 9.7 s → a 4-bar loop from 2 s to 10 s (start on a beat, whole bars)');
p = K.plan({ start: 2.1, end: 2.2, bpm: 120, dur: 30 }); ok(p.bars === 1 && p.end === 4, 'the end handle dragged onto the start: still one bar');
p = K.plan({ start: 27.9, end: 40, bpm: 120, dur: 30 }); ok(p.start === 28 && p.bars === 1 && p.end === 30, 'near the end: as many whole bars as fit (one)');
p = K.plan({ start: 29.6, end: 31, bpm: 120, dur: 30 }); ok(p.start === 28 && p.end === 30, 'a start with no room for a bar after it moves back a beat at a time');
p = K.plan({ start: 1, end: 30, bpm: 120, dur: 30 }); ok(p.start === 1 && p.bars === 14 && p.end === 29, 'the end never goes past the sketch: 14 bars from 1 s');
ok(K.plan({ start: 0, end: 3, bpm: 60, dur: 3 }) === null, 'a sketch shorter than a bar: no loop (null)');
p = K.plan({ start: 0.5, end: 8, bpm: 120, origin: 0.37, dur: 30 }); ok(near(p.start, 0.37) && near(p.end, 8.37) && p.bars === 4, 'with the beat found at 0.37 s, the start snaps to 0.37 s');
p = K.initial({ bpm: 120, origin: 4.37, dur: 30 }); ok(near(p.start, 0.37) && p.bars === 4, 'the first loop shown: 4 bars from the first bar line in the sketch');
p = K.initial({ bpm: 60, origin: 0, dur: 9 }); ok(p.bars === 2 && p.start === 0, 'a short sketch: as many bars as fit (2 at 60 BPM in 9 s)');
const fr = K.frames(K.plan({ start: 2, end: 10, bpm: 120, dur: 30 }));
ok(fr.from === 96000 && fr.length === 384000, '4 bars at 120 BPM from 2 s → frames 96,000 + 384,000 at 48 kHz');
ok(K.frames(K.plan({ start: 0, end: 10, bpm: 97, dur: 30 })).length === Math.round(4 * 240 / 97 * 48000), 'at 97 BPM the length is the exact bars, rounded once (no drift per bar)');
ok(K.barsOf(30, 120) === 15 && K.barsOf(30, 97) === 12 && K.barsOf(1, 120) === 1, 'a whole sketch in bars: 30 s at 120 BPM = 15, at 97 BPM = 12, never 0');

// ---- 2. the tempo finder
function track(bpm, { secs = 30, off = 0.37, accentAt = 0, noise = 0.02, rate = 48000, accent = true } = {}) {
  const n = Math.round(secs * rate), Lc = new Float32Array(n); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < n; i++) Lc[i] = rnd() * noise;
  const beat = 60 / bpm;
  for (let k = 0; off + k * beat < secs; k++) {
    const s = Math.round((off + k * beat) * rate), down = accent && k % 4 === accentAt, amp = down ? 0.9 : 0.35, f = down ? 80 : 1200;
    for (let j = 0; j < 0.08 * rate && s + j < n; j++) Lc[s + j] += amp * Math.exp(-j / (0.015 * rate)) * Math.sin(2 * Math.PI * f * j / rate);
  }
  return { rate, channels: [Lc, Float32Array.from(Lc)] };
}
const found = [];
for (const bpm of [72, 85, 90, 97, 110, 120, 128, 140, 150, 160, 174]) {
  const d = K.detect(track(bpm)); found.push(`${bpm}→${d?.bpm}`);
  ok(d && d.bpm === bpm, `${bpm} BPM found as ${d?.bpm} (a whole BPM, exactly)`);
}
ok(Math.abs(K.detect(track(124, { accent: false, noise: 0.08 })).bpm - 124) <= 0.5, 'no accents and louder noise: 124 BPM still found');
ok(Math.abs(K.detect(track(100, { secs: 8 })).bpm - 100) <= 0.5, 'an 8-second sketch: 100 BPM found');
const silent = { rate: 48000, channels: [new Float32Array(48000 * 10), new Float32Array(48000 * 10)] };
ok(K.detect(silent) === null, 'silence: no tempo (null), the field asks for one');
ok(K.detect({ rate: 48000, channels: [new Float32Array(48000), new Float32Array(48000)] }) === null, 'under 2 seconds: no tempo');
const d1 = K.detect(track(120, { off: 0.37 }));
ok(Math.abs(d1.origin - 0.37) < 0.015 && Math.abs(d1.downbeat - 0.37) < 0.015 && d1.confidence >= 0.5, `the beat's phase: first beat at ${d1.origin.toFixed(3)} s (0.37), bar line at ${d1.downbeat.toFixed(3)} s, sure (${d1.confidence})`);
const d2 = K.detect(track(120, { off: 0.37, accentAt: 2 }));
ok(Math.abs(d2.downbeat - 1.37) < 0.015, `the bar's first beat is the accented one: ${d2.downbeat.toFixed(3)} s (1.37)`);
const ph = K.phase(track(100, { off: 0.2, accentAt: 1 }), 100);
ok(Math.abs(ph.origin - 0.2) < 0.015 && Math.abs(ph.downbeat - 0.8) < 0.015, `a tempo already known (100 BPM, the session's): beats from ${ph.origin.toFixed(3)} s, bars from ${ph.downbeat.toFixed(3)} s (0.8)`);
ok(K.phase(silent, 0).origin === 0, 'no tempo: the grid starts at 0');

// ---- 3. the cut, the WAV, the name
const src = track(120, { secs: 12 }), plan = K.plan({ start: 2, end: 6, bpm: 120, dur: 12 }), c = K.cut(src, K.frames(plan));
ok(c.rate === 48000 && c.channels.length === 2 && c.channels[0].length === 96000 * 2, 'the cut: exactly 2 bars (192,000 frames) in both channels');
ok(c.channels[0][0] === 0 && Math.abs(c.channels[0][143]) <= Math.abs(src.channels[0][96000 + 143]) && c.channels[0][50000] === src.channels[0][96000 + 50000], 'its edges fade over 3 ms, the middle is the sketch as it was');
ok(K.cut(src, { from: 48000 * 11, length: 96000 }).channels[0].subarray(48000 + 200).every(v => v === 0), 'past the sketch\'s end: silence, never garbage');
const back = P.decodeWav(P.encodeWav(c));
ok(back.rate === 48000 && back.channels[0].length === c.channels[0].length && Math.abs(back.channels[0][50000] - c.channels[0][50000]) < 1e-4, 'encoded as a 16-bit 48 kHz WAV and read back the same');
ok(K.loopName('/x/creative-sketches/Sunday session/Sketch 2026-10-26 14.05.33.wav', 4, 120) === 'Sketch 2026-10-26 14.05.33 loop 4 bars 120 BPM.wav' && K.loopName('C:\\a\\Sketch 1.wav', 1, 97.53) === 'Sketch 1 loop 1 bar 97.5 BPM.wav', 'the loop\'s name: the sketch\'s, + "loop 4 bars 120 BPM" (Windows paths too)');
ok(K.label(K.plan({ start: 2, end: 10, bpm: 120, dur: 30 })) === '4 bars · 0:02.0 – 0:10.0', 'the line under the waveform: "4 bars · 0:02.0 – 0:10.0"');

// ---- 4. the main side
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sketchpads67-')), dir = path.join(data, 'creative-sketches', 'Sunday session');
fs.mkdirSync(dir, { recursive: true });
const sketch = path.join(dir, 'Sketch 2026-10-26 14.05.33.wav'), sketchBytes = P.encodeWav(track(120, { secs: 30 }));
fs.writeFileSync(sketch, sketchBytes); const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), h0 = hash(sketch), m0 = fs.statSync(sketch).mtimeMs;
const loopBytes = P.encodeWav(K.cut(P.decodeWav(sketchBytes), K.frames(K.plan({ start: 2, end: 10, bpm: 120, dur: 30 }))));
const r1 = M.saveLoop(data, sketch, loopBytes, { name: K.loopName(sketch, 4, 120), bpm: 120, bars: 4, beats: 4, start: 2, project: 'Sunday session' });
ok(r1.path === path.join(dir, 'Sketch 2026-10-26 14.05.33 loop 4 bars 120 BPM.wav') && fs.existsSync(r1.path), 'Save loop: a NEW WAV beside the sketch, "… loop 4 bars 120 BPM.wav"');
ok(hash(sketch) === h0 && fs.statSync(sketch).mtimeMs === m0, 'the sketch itself is byte-for-byte unchanged');
const w = M.wavInfo(fs.readFileSync(r1.path)); ok(w.rate === 48000 && w.bits === 16 && w.channels === 2 && w.frames === 384000, 'the loop file: 16-bit, 48 kHz, stereo, exactly 384,000 frames (4 bars at 120 BPM)');
const card = JSON.parse(fs.readFileSync(r1.path.replace(/\.wav$/, '.json'), 'utf8'));
ok(card.v === 1 && card.kind === 'sketch-loop' && card.loop === r1.path && card.from === sketch && card.bpm === 120 && card.bars === 4 && card.beats === 4 && card.seconds === 8 && card.sketch === 'Sunday session', 'its card: a park-take shape (loop, bpm, bars, beats) + kind sketch-loop, from the sketch, 8 s');
ok(!fs.readdirSync(dir).some(n => n.endsWith('.part')), 'written whole (no .part left)');
const r2 = M.saveLoop(data, sketch, loopBytes, { name: K.loopName(sketch, 4, 120), bpm: 120, bars: 4, start: 2 });
ok(r2.path.endsWith('loop 4 bars 120 BPM 2.wav') && hash(r1.path) === hash(r2.path), 'the same loop saved twice: " 2", the first never overwritten');
const refuse = (fn, re, msg) => { let e = null; try { fn(); } catch (x) { e = x; } ok(e && re.test(e.message), msg + ` (“${e?.message}”)`); };
const outside = path.join(data, 'elsewhere.wav'); fs.writeFileSync(outside, sketchBytes);
refuse(() => M.saveLoop(data, outside, loopBytes, { bpm: 120, bars: 4 }), /not in your sketches folder/, 'a sketch outside <data>/creative-sketches is refused');
refuse(() => M.saveLoop(data, path.join(dir, 'gone.wav'), loopBytes, { bpm: 120, bars: 4 }), /not in your sketches folder/, 'a sketch that\'s gone is refused');
refuse(() => M.saveLoop(data, path.join(dir, '..', '..', '..', 'elsewhere.wav'), loopBytes, { bpm: 120, bars: 4 }), /not in your sketches folder/, 'a path climbing out with .. is refused');
refuse(() => M.saveLoop(data, sketch, P.encodeWav({ rate: 44100, channels: [new Float32Array(44100)] }), { bpm: 120, bars: 1 }), /48 kHz/, 'a loop that isn\'t 48 kHz is refused');
refuse(() => M.saveLoop(data, sketch, Buffer.from('not a wav at all, not at all, not at all, not at all'), { bpm: 120, bars: 1 }), /48 kHz/, 'bytes that aren\'t a WAV are refused');
refuse(() => M.saveLoop(data, sketch, loopBytes, { bpm: 300, bars: 4 }), /tempo/, 'a tempo outside 40–240 is refused');
refuse(() => M.saveLoop(data, sketch, loopBytes, { bpm: 120, bars: 2.5 }), /whole number of bars/, 'half a bar is refused');
ok(fs.readdirSync(dir).filter(n => /\.wav$/.test(n)).length === 3, 'refusals wrote nothing (the sketch + 2 loops)');
const sk2 = path.join(dir, 'Sketch 2026-10-26 15.00.00.wav'); fs.writeFileSync(sk2, sketchBytes);
M.saveLoop(data, sk2, loopBytes, { name: K.loopName(sk2, 4, 120), bpm: 120, bars: 4 });
ok(M.loopsOf(data, sketch).length === 2 && M.loopsOf(data, sk2).length === 1 && M.loopsOf(data, outside).length === 0, 'each sketch lists its own loops (2 and 1), a path outside lists none');
const takes = M.loopTakes(data); ok(takes.length === 3 && takes.every(t => t.kind === 'sketch-loop' && t.place === 'Sketch loop' && t.folder === 'Sunday session' && fs.existsSync(t.loop)), 'every sketch loop as a take for the pickers (3)');
ok(V.parkList(data).takes.length === 3, 'no park folder yet: parkList still lists the 3 sketch loops');
const parkDir = path.join(data, 'creative-park', 'Buttes'); fs.mkdirSync(parkDir, { recursive: true });
fs.writeFileSync(path.join(parkDir, 'take.json'), JSON.stringify({ v: 1, loop: path.join(parkDir, 'take.wav'), bpm: 100, bars: 4, place: 'Buttes', sketch: 'Buttes', at: '2026-10-20T10:00:00Z' }));
const list = V.parkList(data).takes;
ok(list.length === 4 && list.filter(t => t.kind === 'sketch-loop').length === 3 && list.some(t => t.place === 'Buttes'), 'creative-vstmain parkList (Arrange, the Live set\'s shelf): the park take + the 3 sketch loops');
fs.unlinkSync(r2.path); ok(M.loopsOf(data, sketch).length === 1 && V.parkList(data).takes.length === 3, 'a loop whose WAV is gone is not listed (its card alone is ignored)');
ok(V.liveClip(data, r1.path) === r1.path && V.liveClip(data, sketch) === sketch, 'the Live set\'s clip guard accepts a sketch and its loop (<data>/creative-sketches)');
refuse(() => V.liveClip(data, outside), /Clips come from/, 'and still refuses a WAV outside Hearth\'s folders');
ok(JSON.stringify(M.trashList(data, r1.path)) === JSON.stringify([r1.path, r1.path.replace(/\.wav$/, '.json')]) && M.trashList(data, sketch) === null && M.trashList(data, outside) === null, 'Remove loop: the loop + its card go to the Trash; a sketch or a file outside never through here');

// ---- 5. on a Live set pad
const set = L.create({ bpm: 120 }), pad = L.addPad(set, 0, { kind: 'clip', label: 'Loop 4 bars', loop: true, bars: 4, source: { type: 'take', file: r1.path, bpm: 120 } });
ok(pad.loop && pad.bars === 4 && L.fit(pad.source, set.scenes[0]).ratio === 1 && !L.fit(pad.source, set.scenes[0]).stretch && L.keyOf(set.scenes[0], pad) === '1', 'a loop at the song\'s tempo on pad 1: a loop pad, played as is (no stretch)');
const one = L.addPad(set, 0, { kind: 'clip', label: 'Sketch 14:05', loop: false, bars: K.barsOf(30, 128), source: { type: 'take', file: sketch, bpm: 128 } });
ok(!one.loop && one.bars === 16 && L.fit(one.source, set.scenes[0]).stretch && L.keyOf(set.scenes[0], one) === '2', 'a whole sketch at 128 BPM in a 120 BPM song: a one-shot pad on key 2, fitted to the song\'s tempo');

fs.rmSync(data, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, ...out, tempos: found.join(' ') }));
