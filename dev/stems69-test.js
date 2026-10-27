// (round 69, stems69) 📤 Send to my DAW, without a sound card or a DAW:
//   1. names (tools/dawsend-core.js): Windows + Mac safe, tempo and key in them, the folder "<song> — stems <date>";
//   2. the common length: whole bars at the song's tempo (also when a bar isn't a whole number of samples), every file the
//      same count; padding / cutting a part on bar 1; mono → stereo; the shared "never clip" gain;
//   3. 24-bit WAVs: the header, the samples written in pieces = written whole, read back exactly (≤ ½ LSB);
//   4. ALIGNMENT: generated parts with clicks at known samples → every WAV the same length and every click at the same
//      sample in its stem and in the mix (the stems add up to the mix within 2 LSB);
//   5. the key from the notes (and what the owner types), a pad's notes on the song's grid, its MIDI at bar 1, the README;
//   6. main (dawsendmain.js): a new folder (never over one: " 2"), staged as .part and renamed, 'wx' files, the size the
//      header promised, names that can't escape the folder, preset copies (the original untouched), a Vital bank preset
//      written as .vital, Cancel removing only the staging folder.
//   node dev/stems69-test.js
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), zlib = require('zlib'), assert = require('assert/strict');
const K = require('../tools/dawsend-core.js'), P = require('../tools/parkjam-core.js'), M = require('../dawsendmain.js');
const out = { checks: 0 }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---- 1. names
ok(K.clean('Belle/ville: <night>?') === 'Belle ville night' && K.clean('  Song...  ') === 'Song' && K.clean('CON') === '_CON' && K.clean('nul.txt') === '_nul.txt' && K.clean('') === 'Song' && K.clean('a\u0000b|c*d') === 'a b c d', 'names drop / \\ : * ? " < > | and control characters, trailing dots and spaces, and Windows device names');
ok(K.clean('x'.repeat(200)).length === 60 && K.clean('Café') === 'Café'.normalize('NFC'), 'names stay short (60) and NFC (the same on the Mac and Windows)');
const d = new Date(2026, 9, 26, 23, 59);
ok(K.folderName('Night bus', d) === 'Night bus — stems 2026-10-26', 'the folder: "<song> — stems <date>"');
ok(K.fileName({ n: 1, name: 'Belleville 4 bars', bpm: 124, key: 'A minor' }) === '01 Belleville 4 bars - 124 BPM - A minor.wav', 'a stem: number, name, tempo and key');
ok(K.fileName({ n: 0, name: 'Mix', bpm: 123.5, key: '' }) === '00 Mix - 123.5 BPM.wav' && K.fileName({ n: 12, name: 'Lead', bpm: 97.25, key: 'F# major', ext: 'mid' }) === '12 Lead - 97.25 BPM - F# major.mid', 'the mix is 00; a tempo with decimals; no key → no key in the name; MIDI shares its stem\'s name');
ok(K.presetName('Vital', 'Warm: keys', '.vital') === 'Vital - Warm keys.vital', 'a preset copy: "<instrument> - <name>"');

// ---- 2. the common length
let pl = K.plan({ bpm: 120, beats: 4, frames: [96000, 384000, 200000] });
ok(pl.bars === 4 && pl.total === 384000 && pl.seconds === 8, '120 BPM: the longest part (4 bars) sets the length: 384,000 samples');
pl = K.plan({ bpm: 120, frames: [384001] }); ok(pl.bars === 5 && pl.total === 480000, 'one sample past a bar → the next whole bar');
pl = K.plan({ bpm: 124, frames: [3.3 * 4 * 60 / 124 * 48000] });
ok(pl.bars === 4 && pl.total === Math.round(4 * 4 * 60 / 124 * 48000) && pl.total === 371613, `124 BPM (a bar is ${K.barFrames(124).toFixed(4)} samples): 3.3 bars → 4 bars, rounded once to ${pl.total}`);
ok(K.plan({ bpm: 90, beats: 3, frames: [10] }).total === 96000, '3/4 at 90 BPM: one bar is 2 s; anything shorter is still one whole bar');
assert.throws(() => K.plan({ bpm: null, frames: [1] }), /tempo/); assert.throws(() => K.plan({ bpm: 60, frames: [31 * 60 * 48000] }), /too long/); out.checks += 2;
const mono = new Float32Array([0.5, -0.25, 0.125]);
let f = K.fit([mono], 6); ok(f.length === 2 && f[0].length === 6 && f[1][1] === -0.25 && f[0][5] === 0 && f[0][3] === 0, 'a mono part becomes stereo, padded with silence after it');
f = K.fit([new Float32Array(10).fill(1), new Float32Array(10).fill(-1)], 4, 0.5); ok(f[0].length === 4 && f[0][3] === 0.5 && f[1][0] === -0.5, 'a longer part is cut at the end; the gain is applied');
ok(K.safeGain(0.5).gain === 1 && K.safeGain(10 ** (-1 / 20)).gain === 1, 'levels are left as heard when the mix stays under −1 dBFS');
const sg = K.safeGain(1.6); ok(near(sg.gain * 1.6, 10 ** (-1 / 20), 1e-12) && near(sg.db, 20 * Math.log10(10 ** (-1 / 20) / 1.6), 1e-9), `a mix peaking at 1.6 → every file turned down ${sg.db.toFixed(2)} dB together (the mix at −1 dBFS)`);

// ---- 3. 24-bit WAVs
const ch = [new Float32Array(1000), new Float32Array(1000)]; for (let i = 0; i < 1000; i++) { ch[0][i] = Math.sin(i / 7) * 0.9; ch[1][i] = (i % 50) / 50 - 0.5; } ch[0][10] = 1.5; ch[1][11] = -2;
const whole = K.pcm24(ch, 0, 1000), pieces = [K.pcm24(ch, 0, 333), K.pcm24(ch, 333, 777), K.pcm24(ch, 777, 1000)];
ok(Buffer.compare(Buffer.from(whole), Buffer.concat(pieces.map(b => Buffer.from(b)))) === 0 && whole.length === K.dataBytes(1000), 'samples written in pieces are byte-for-byte the samples written whole (3 bytes × 2 channels each)');
const wav = new Uint8Array([...K.wavHeader({ frames: 1000 }), ...whole]), back = P.decodeWav(wav);
ok(back.rate === 48000 && back.channels.length === 2 && back.channels[0].length === 1000, 'the header: 48 kHz, stereo, 24-bit PCM, 1,000 frames (read back by Hearth\'s own WAV reader)');
const hdr = Buffer.from(K.wavHeader({ frames: 1000 })); ok(hdr.readUInt16LE(20) === 1 && hdr.readUInt16LE(34) === 24 && hdr.readUInt32LE(28) === 48000 * 6 && hdr.readUInt16LE(32) === 6 && hdr.readUInt32LE(40) === 6000 && hdr.readUInt32LE(4) === 6036, 'fmt: PCM, 24 bits, 288,000 bytes/s, block 6, data 6,000 bytes, RIFF size right');
let worst = 0; for (let i = 0; i < 1000; i++) if (i !== 10 && i !== 11) worst = Math.max(worst, Math.abs(back.channels[0][i] - ch[0][i]), Math.abs(back.channels[1][i] - ch[1][i]));
ok(worst <= 0.5 / 8388608 + 1e-12 && near(back.channels[0][10], 8388607 / 8388608) && back.channels[1][11] === -1, `read back within ½ LSB of 24 bits (${(worst * 8388608).toFixed(3)} LSB); over full scale is clipped, never wrapped`);

// ---- 4. alignment: parts with clicks at known samples
const bpm = 124, bf = K.barFrames(bpm), click = (len, at, v = 0.5) => { const c = new Float32Array(len); for (const a of at) c[a] = v; return c; };
const parts = [
  { name: 'Kick 2 bars', ch: [click(Math.round(2 * bf), [0, Math.round(bf)])] },
  { name: 'Hats 4 bars', ch: [click(Math.round(4 * bf), [Math.round(bf / 2), Math.round(3 * bf)], 0.25), click(Math.round(4 * bf), [Math.round(bf / 2)], 0.25)] },
  { name: 'Song one-shot', ch: [click(Math.round(3.3 * bf), [1234, Math.round(3.3 * bf) - 1], 0.4), click(Math.round(3.3 * bf), [1234], 0.4)] }
];
pl = K.plan({ bpm, frames: parts.map(p => p.ch[0].length) });
const fitted = parts.map(p => K.fit(p.ch, pl.total)), mix = K.sum(fitted, pl.total), g = K.safeGain(K.peakOf(mix));
const files = [mix, ...fitted].map(c => P.decodeWav(new Uint8Array([...K.wavHeader({ frames: pl.total }), ...K.pcm24(c, 0, pl.total, g.gain)])));
ok(files.every(x => x.channels[0].length === pl.total && x.channels[1].length === pl.total) && pl.bars === 4, `every file (mix + 3 stems) is exactly ${pl.total} samples (4 bars at 124 BPM)`);
const at = (x, i, c = 0) => x.channels[c][i], lsb = 1 / 8388608;
ok(near(at(files[1], 0), 0.5, lsb) && near(at(files[1], Math.round(bf)), 0.5, lsb) && at(files[1], Math.round(2 * bf)) === 0 && near(at(files[0], Math.round(bf)), 0.5, lsb), 'the kick: on sample 0 (bar 1) and on bar 2 in its stem and in the mix; silence after its 2 bars');
ok(near(at(files[2], Math.round(bf / 2)), 0.25, lsb) && near(at(files[2], Math.round(3 * bf)), 0.25, lsb) && near(at(files[0], Math.round(bf / 2), 1), 0.25, lsb), 'the hats: their clicks at the same samples in the stem and in the mix (both channels)');
ok(near(at(files[3], 1234), 0.4, lsb) && near(at(files[3], Math.round(3.3 * bf) - 1), 0.4, lsb) && at(files[3], Math.round(3.3 * bf)) === 0 && near(at(files[0], 1234), 0.4, lsb), 'the one-shot: its first click at sample 1,234 everywhere, its last sample kept, silence to the 4th bar line');
let sumErr = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < pl.total; i += 7) sumErr = Math.max(sumErr, Math.abs(at(files[0], i, c) - (at(files[1], i, c) + at(files[2], i, c) + at(files[3], i, c))));
ok(sumErr <= 2 * lsb, `the stems add up to the mix (within ${(sumErr / lsb).toFixed(2)} LSB of 24 bits)`);
const loud = [K.fit([new Float32Array(100).fill(0.8)], 100), K.fit([new Float32Array(100).fill(0.7)], 100)], lg = K.safeGain(K.peakOf(K.sum(loud, 100)));
ok(near(1.5 * lg.gain, 10 ** (-1 / 20), 1e-12) && near(0.8 * lg.gain + 0.7 * lg.gain, 10 ** (-1 / 20), 1e-12), 'two parts that would clip together: both turned down by the same gain, the mix lands on −1 dBFS');

// ---- 5. key, notes, MIDI, README
const N = (notes, len = 0.4) => notes.map((note, i) => ({ note, time: i * 0.25, length: len, velocity: 100 }));
ok(K.guessKey(N([57, 60, 64, 57, 60, 64, 69, 67, 65, 64, 62, 60, 59, 57, 45, 52]))?.name === 'A minor', 'A minor phrase → "A minor"');
ok(K.guessKey(N([60, 62, 64, 65, 67, 69, 71, 72, 67, 64, 60, 55]))?.name === 'C major', 'a C major scale → "C major"');
ok(K.guessKey(N([60, 64, 67])) === null && K.guessKey(N([60, 60, 60, 60, 60, 60, 60])) === null && K.guessKey([]) === null, 'too few notes or one pitch: no guess (the panel asks instead)');
ok(K.keyText('am') === 'A minor' && K.keyText('F# major') === 'F# major' && K.keyText('bb min') === 'Bb minor' && K.keyText('C') === 'C major' && K.keyText('Eb maj') === 'Eb major' && K.keyText('c♯m') === 'C# minor' && K.keyText('hello') === '' && K.keyText('') === '', 'what the owner types is tidied ("am" → A minor, "bb min" → Bb minor); anything else is left out');
const pn = K.padNotes([{ note: 60, time: 0, length: 0.5, velocity: 90 }, { note: 64, time: 1.1, length: 1, velocity: 300 }, { note: 67, time: 5, length: 1 }, { note: 200, time: 0, length: 1 }], { ratio: 1.1, seconds: 1.5 });
ok(pn.length === 2 && pn[0].time === 0 && near(pn[0].length, 0.5 / 1.1, 1e-6) && near(pn[1].time, 1, 1e-6) && near(pn[1].length, 0.5, 1e-6) && pn[1].velocity === 127, 'a stretched take\'s notes (×1.1) land on the song\'s grid; notes after the part are dropped, the last one cut at its end; bad notes skipped');
const mid = Buffer.from(P.midiFile(pn, { bpm: 124, beats: 4, name: 'Lead' }));
ok(mid.toString('ascii', 0, 4) === 'MThd' && mid.indexOf(Buffer.from([0xff, 0x51, 3])) > 0 && mid.readUInt16BE(12) === 480, 'the MIDI file: type 0, 480 ticks a beat, with the tempo');
{ const us = mid.indexOf(Buffer.from([0xff, 0x51, 3])) + 3; ok(((mid[us] << 16) | (mid[us + 1] << 8) | mid[us + 2]) === Math.round(60e6 / 124), 'its tempo is the song\'s (124 BPM)'); }
{ const on = mid.indexOf(Buffer.from([0x90, 60])); ok(on > 0 && mid[on - 1] === 0, 'its first note is at tick 0: bar 1, like the WAVs'); }
const rd = K.readme({ song: 'Night bus', source: 'Arrange', bpm: 124, beats: 4, key: 'A minor', keyFrom: 'guessed from your notes', bars: 4, seconds: pl.seconds, gainDb: -2.3, files: [{ name: '00 Mix - 124 BPM - A minor.wav', what: 'the whole song' }, { name: '01 Lane 1 - 124 BPM - A minor.mid', what: 'MIDI' }], skipped: ['Serum 2 preset “Pad”: lives inside Hearth'], date: d });
ok(/Tempo: 124 BPM, 4\/4/.test(rd) && /Key: A minor \(guessed from your notes\)/.test(rd) && /4 bars/.test(rd) && /bar 1/.test(rd) && rd.includes('- 00 Mix - 124 BPM - A minor.wav: the whole song') && /turned down by 2\.3 dB/.test(rd) && /Not included:\r\n- Serum 2/.test(rd) && rd.includes('\r\n'), 'README.txt: tempo, key (and where it came from), length, how to drop them at bar 1, each file, the gain, what wasn\'t included (CRLF lines)');
ok(/Key: not known/.test(K.readme({ song: 'x', source: 'y', bpm: 100, bars: 1, seconds: 2.4, files: [] })), 'README without a key says so');

// ---- 6. main
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stems69-')), dest = path.join(tmp, 'My Music');
fs.mkdirSync(dest); fs.writeFileSync(path.join(dest, 'keep.txt'), 'the owner\'s file');
const b1 = M.begin(dest, 'Night bus — stems 2026-10-26'), part = b1.folder + '.part';
ok(b1.folder === path.join(dest, 'Night bus — stems 2026-10-26') && fs.existsSync(part) && !fs.existsSync(b1.folder), 'begin: the final name is chosen, the files go to "<name>.part" until finished');
const b2 = M.begin(dest, 'Night bus — stems 2026-10-26');
ok(b2.folder === b1.folder + ' 2', 'a second export with the same name gets " 2" (nothing is ever written over)');
assert.throws(() => M.begin('relative/dir', 'x'), /exists/); assert.throws(() => M.begin(path.join(tmp, 'nope'), 'x'), /exists/); out.checks += 2;
const frames = 4800, data = K.pcm24([new Float32Array(frames).fill(0.25), new Float32Array(frames).fill(-0.25)], 0, frames);
M.open(b1.job, '01 Kick - 124 BPM.wav', K.wavHeader({ frames }), K.dataBytes(frames));
M.write(b1.job, '01 Kick - 124 BPM.wav', data.subarray(0, 10000)); M.write(b1.job, '01 Kick - 124 BPM.wav', data.subarray(10000));
assert.throws(() => M.write(b1.job, '01 Kick - 124 BPM.wav', new Uint8Array(6)), /More audio/); out.checks++;
ok(M.close(b1.job, '01 Kick - 124 BPM.wav').bytes === 44 + frames * 6, 'a WAV written in pieces: exactly the size its header promised (more is refused)');
M.open(b1.job, '02 Short.wav', K.wavHeader({ frames }), K.dataBytes(frames)); M.write(b1.job, '02 Short.wav', data.subarray(0, 600));
assert.throws(() => M.close(b1.job, '02 Short.wav'), /not/); out.checks++;
assert.throws(() => M.open(b1.job, '01 Kick - 124 BPM.wav', K.wavHeader({ frames }), 6), /EEXIST/); out.checks++;
for (const bad of ['../escape.wav', '..', 'a/b.wav', 'Presets/../x.vital', 'x.exe', 'C:\\x.wav', 'Presets/a.wav']) assert.throws(() => M.put(b1.job, bad, 'x'), Error, bad);
assert.throws(() => M.open(b1.job, '../up.wav', K.wavHeader({ frames: 1 }), 6), /plain|Not a file/); out.checks += 2;
ok(!fs.existsSync(path.join(dest, 'escape.wav')) && !fs.existsSync(path.join(tmp, 'up.wav')), 'names that would leave the folder (.., slashes, other types) are refused: nothing written outside');
M.put(b1.job, '01 Kick - 124 BPM.mid', mid); M.put(b1.job, 'README.txt', rd);
assert.throws(() => M.put(b1.job, 'README.txt', 'again'), /EEXIST/); out.checks++;
const preset = path.join(tmp, 'Warm keys.vital'), presetBytes = Buffer.from(JSON.stringify({ preset_name: 'Warm keys', settings: { osc_1_on: 1 } }));
fs.writeFileSync(preset, presetBytes); const before = fs.statSync(preset).mtimeMs, hash = crypto.createHash('sha256').update(presetBytes).digest('hex');
M.copy(b1.job, preset, 'Presets/Vital - Warm keys.vital');
ok(crypto.createHash('sha256').update(fs.readFileSync(path.join(part, 'Presets', 'Vital - Warm keys.vital'))).digest('hex') === hash && fs.statSync(preset).mtimeMs === before && fs.existsSync(preset), 'a preset file is copied byte-for-byte into Presets/; the original is untouched');
fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x'); assert.throws(() => M.copy(b1.job, path.join(tmp, 'notes.txt'), 'Presets/x.vital'), /Not a preset/); assert.throws(() => M.copy(b1.job, path.join(tmp, 'missing.vital'), 'Presets/y.vital'), /Not a preset/); out.checks += 2;
const vitalState = 'z1:' + zlib.deflateSync(Buffer.from(JSON.stringify({ preset_name: 'Bank pad', author: 'Q' }))).toString('base64');
ok(M.state(b1.job, 'Presets/Vital - Bank pad.vital', vitalState).ok && JSON.parse(fs.readFileSync(path.join(part, 'Presets', 'Vital - Bank pad.vital'), 'utf8')).preset_name === 'Bank pad', 'a Vital preset from the desk\'s bank (z1 state) is written out as a .vital');
ok(M.state(b1.job, 'Presets/Vital - Opaque.vital', Buffer.from([1, 2, 3, 0, 9]).toString('base64')).ok === false && !fs.existsSync(path.join(part, 'Presets', 'Vital - Opaque.vital')), 'a state that isn\'t a Vital JSON preset is not written (the README lists it as not included)');
const fin = M.finish(b1.job);
ok(fin.folder === b1.folder && fs.existsSync(b1.folder) && !fs.existsSync(part) && fin.files.includes('README.txt') && fin.files.includes('Presets/Vital - Warm keys.vital'), 'finish: "<name>.part" becomes "<name>"; the files are listed');
ok(P.decodeWav(new Uint8Array(fs.readFileSync(path.join(b1.folder, '01 Kick - 124 BPM.wav')))).channels[0].length === frames, 'the finished WAV reads back with every frame');
assert.throws(() => M.write(b1.job, 'x.wav', data), /over/); out.checks++;
M.open(b2.job, '00 Mix.wav', K.wavHeader({ frames }), K.dataBytes(frames)); M.write(b2.job, '00 Mix.wav', data.subarray(0, 600));
ok(M.cancel(b2.job).gone && !fs.existsSync(b2.folder + '.part') && !fs.existsSync(b2.folder) && fs.readFileSync(path.join(dest, 'keep.txt'), 'utf8') === 'the owner\'s file' && fs.existsSync(b1.folder), 'Cancel removes its own staging folder only: the chosen folder, the owner\'s file and the finished export stay');
ok(M.cancel('daw-nothing').gone === false, 'cancelling twice is harmless');
const b3 = M.begin(dest, 'Night bus — stems 2026-10-26'); ok(b3.folder === b1.folder + ' 2', 'after a cancel, the name " 2" is free again'); M.cancel(b3.job);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ pass: true, ...out }));
