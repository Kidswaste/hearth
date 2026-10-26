// (round 69, stems69) 📤 Send to my DAW, in the real app, by CLICKING, with the fake instrument host (no audio device, no
// real plugins, no DAW) and an isolated profile:
//   node dev/smoke.js --fake-vst --script dev/checks/stems69.js --shot /tmp/stems69.png
// Fixtures: generated 48 kHz clips at 124 BPM with clicks at known samples (a 2-bar kick loop with its played notes in
// A minor, a 4-bar hats loop, a 3.3-bar one-shot), a Live set song "Night bus" with them on pads + a bank preset pad, an
// Arrange song (kick ×2 on lane 1, hats from bar 2 on lane 2), and a chosen place remembered from before.
// Then: nothing loads before the button · 🎤 Live set → ✎ Edit → 📤 Send to my DAW (the song preselected) → the
// panel's words (stems 3, MIDI 1 part, presets, key guessed "A minor") → 📤 → progress → "Night bus — stems <date>":
// every WAV 48 kHz 24-bit and EXACTLY the same length (4 bars), each click at the same sample in its stem and in the
// mix, the stems adding up to the mix, the MIDI at bar 1 / 124 BPM, the preset copies, the README; Show folder ·
// Arrange's 📤 (Arrange preselected, Presets unticked: none written, 5 bars, lanes on the bar grid) · the top row's 📤
// with Cancel mid-way (nothing left behind, the owner's file untouched) · nothing sent anywhere.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Send to my DAW: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const sent = []; const realFetch = window.fetch; window.fetch = (u, ...a) => { sent.push(String(u?.url || u)); return realFetch(u, ...a); };
const realOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { sent.push(String(u)); return realOpen.call(this, m, u, ...a); };
const dir = `${window.SMOKE_TMP}/stems69`, OUT = `${dir}/My Music`, SEP = navigator.platform.startsWith('Win') ? '\\' : '/';
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
await hub.fs.write(`${OUT}/keep.txt`, 'the owner\'s file');
await Lazy.load('creative'); const P = ParkJamCore, S = LoopSongCore, C = LiveSetCore;
const BPM = 124, bf = 4 * 60 / BPM * 48000, R = Math.round;
const clip = (len, clicks) => { const L = new Float32Array(len), Rr = new Float32Array(len); for (const [at, v, both = true] of clicks) { L[at] = v; if (both) Rr[at] = v; } return { rate: 48000, channels: [L, Rr] }; };
const kick = clip(R(2 * bf), [[4800, 0.5], [R(bf) + 4800, 0.5]]), hats = clip(R(4 * bf), [[R(bf / 2), 0.25], [R(3 * bf), 0.25, false]]), shot = clip(R(3.3 * bf), [[1234, 0.375], [R(3.3 * bf) - 1, 0.375]]);
const put = async (name, pcm) => { const p = `${dir}${SEP}takes${SEP}${name}`; await hub.fs.write(p, P.encodeWav(pcm)); return p; };
const kickWav = await put('Belleville kick.wav', kick), hatsWav = await put('Belleville hats.wav', hats), shotWav = await put('Night bus song.wav', shot);
const phrase = [57, 60, 64, 57, 60, 64, 69, 67, 65, 64, 62, 60, 59, 57].map((note, i) => ({ note, time: 0.1 + i * 0.25, length: 0.2, velocity: 96 }));
await hub.fs.write(kickWav.replace(/\.wav$/, '.json'), JSON.stringify({ v: 1, notesPlayed: phrase }));
await hub.fs.write(hatsWav.replace(/\.wav$/, '.json'), JSON.stringify({ v: 1, notesPlayed: [] }));
const take = (id, loop, bars) => ({ id, loop, bpm: BPM, beats: 4, bars, seconds: bars * 4 * 60 / BPM, place: 'Belleville', sketch: 'Park sketch · Belleville · 25 Oct', notesFile: loop.replace(/\.wav$/, '.json'), instrument: 'Vital' });
const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = 'Night bus';
const song = S.create({ title: 'Park song', sketch: 'Park sketch · Belleville · 25 Oct', bpm: BPM }); const c1 = S.addClip(song, take('t-kick', kickWav, 2), { lane: 0, bar: 0 }); S.repeat(song, c1.id, 2); S.addClip(song, take('t-hats', hatsWav, 4), { lane: 1, bar: 1 });
project.vst.song = song;
const pad = (id, label, file, loop, bars, type = 'take') => ({ id, kind: 'clip', label, loop, bars, gainDb: 0, fx: 0, file, prepared: { bpm: BPM, ratio: 1, warn: '' }, source: { type, file: type === 'take' ? file : '', bpm: BPM, sketch: 'Park sketch', place: 'Belleville' } });
project.vst.liveset = { v: 1, name: 'Open mic set', instrument: 'Vital', quantize: 'bar', runs: [], scenes: [{ id: 'scene-a', name: 'Night bus', bpm: BPM, beats: 4, pads: [pad('pad-k', 'Kick 2 bars', kickWav, true, 2), pad('pad-h', 'Hats 4 bars', hatsWav, true, 4), pad('pad-s', 'Night bus song', shotWav, false, 4, 'song'), { id: 'pad-p', kind: 'preset', label: 'Bank pad', fx: 0, instrument: 'Vital', preset: { label: 'Bank pad', id: null, from: 'bank' } }] }] };
await hub.kvSet('creative-workbenches', project);
store.set('dawsend.dir', OUT); // the place chosen last time (remembered per computer)
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-instrument-card'), 15000, 'instrument cards');
const api = WorkbenchVST.api, stats = () => document.querySelector('.wb-live-stats')?.textContent || '';
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
await until(() => /^LIVE/.test(stats()), 15000, 'Vital live'); await until(() => api.current()?.ready, 15000, 'controls read');
await api.savePreset('Bank pad'); // the bank preset the pad points at (the fake Vital's state is JSON, like Vital's .vital)
const shown = el => !!el && el.checkVisibility({ visibilityProperty: true });
const click = async (sel, re, root = document) => { const b = await until(() => [...root.querySelectorAll(sel)].find(x => re.test(x.textContent.trim()) && !x.disabled && shown(x)), 15000, String(re)); b.click(); await wait(30); return b; };
const panel = () => document.querySelector('.dw-panel');
const listDir = async p => ((await hub.fs.list(p).catch(() => [])) || []).map(f => f.name).sort();
const readWav = async p => P.decodeWav(new Uint8Array(await hub.fs.read(p, { encoding: 'buffer', maxBytes: 200e6 })));
const header = async p => { const b = new Uint8Array(await hub.fs.read(p, { encoding: 'buffer', maxBytes: 200e6 })), v = new DataView(b.buffer); return { format: v.getUint16(20, true), channels: v.getUint16(22, true), rate: v.getUint32(24, true), bits: v.getUint16(34, true) }; };
const lsb = 1 / 8388608, near = (a, b, t = lsb) => Math.abs(a - b) <= t;
ok(!Lazy.loaded('dawsend'), 'nothing of Send to my DAW loads before its button is clicked (lazy group "dawsend")');
const top = [...document.querySelectorAll('.wb-sound-desk button')].find(b => b.textContent === '📤 Send to my DAW' && shown(b));
ok(top && top.closest('.wb-row') && top.closest('.wb-row') === [...document.querySelectorAll('.wb-sound-desk button')].find(b => b.textContent === '🎤 Live set')?.closest('.wb-row'), 'a labelled “📤 Send to my DAW” button in the Sound desk\'s top row, next to 🎤 Live set');

// 1. 🎤 Live set → ✎ Edit → 📤 Send to my DAW on the song
await click('.wb-sound-desk button', /^🎤 Live set$/); await until(() => document.querySelector('.lv-view'), 8000, 'the Live set');
await click('.lv-view button', /^✎ Edit$/);
let t0 = performance.now(); await click('.lv-view button', /^📤 Send to my DAW$/);
await until(() => panel() && DawSend._test.info()?.parts?.length === 3, 10000, 'the panel read the song'); out.timings.openMs = Math.round(performance.now() - t0);
ok(Lazy.loaded('dawsend') && panel().querySelector('.dw-song').value === 'scene:scene-a', 'the Live set song\'s 📤 opens the panel with that song chosen');
const opts = [...panel().querySelectorAll('.dw-song option')].map(o => o.textContent);
ok(opts.some(t => /^Arrange · Park song · 5 bars · 124 BPM$/.test(t)) && opts.some(t => /^Live set · Night bus · 3 pads · 124 BPM$/.test(t)), 'Song: the Arrange song and the Live set song, in words: ' + opts.join(' | '));
const words = () => [...panel().querySelectorAll('.dw-check')].map(l => l.textContent).join(' · ');
ok(/Stems.*one WAV per pad \(3\)/.test(words()) && /Mix.*the whole song in one WAV/.test(words()) && /MIDI.*the notes of 1 part you played/.test(words()) && /Presets.*2 presets \(copies\)/.test(words()), 'what to send, labelled with counts: ' + words());
ok(panel().querySelector('.dw-key').value === 'A minor' && /guessed from your notes/.test(panel().querySelector('.dw-keyfrom').textContent), 'Key: "A minor", guessed from the notes played on the kick take');
ok(panel().querySelector('.dw-path').textContent === OUT && panel().querySelector('.dw-change')?.textContent === 'Change…', 'Where: the place chosen last time (remembered), with Change…');
ok(/48 kHz 24-bit WAVs, all starting at bar 1, all the same length/.test(panel().querySelector('.dw-meta').textContent), 'it says what it makes: 48 kHz 24-bit, bar 1, same length');
DawSend._test.slow(60); // slow enough to see the progress bar
t0 = performance.now(); await click('.dw-panel button', /^📤 Send to my DAW$/);
const prog = await until(() => panel().querySelector('.dw-progress') && panel().querySelector('.dw-step')?.textContent, 4000, 'the progress');
ok(panel().querySelector('.dw-cancel')?.textContent === 'Cancel' && /%/.test(prog), `progress shows while it writes ("${prog}") with Cancel`);
await until(() => panel().querySelector('.dw-done'), 30000, 'sent'); out.timings.liveSetSendMs = Math.round(performance.now() - t0); DawSend._test.slow(0);
const date = DawSendCore.stamp(), name1 = `Night bus — stems ${date}`, F1 = `${OUT}${SEP}${name1}`;
ok(/^✓ Sent \d+ files to “Night bus — stems \d{4}-\d\d-\d\d” · 4 bars at 124 BPM · A minor\.$/.test(panel().querySelector('.dw-said').textContent), 'it says where it went: ' + panel().querySelector('.dw-said').textContent);
ok(panel().querySelector('.dw-show')?.textContent === 'Show folder' && shown(panel().querySelector('.dw-show')), 'Show folder, after');
const files1 = await listDir(F1), expect1 = ['00 Mix - 124 BPM - A minor.wav', '01 Kick 2 bars - 124 BPM - A minor.mid', '01 Kick 2 bars - 124 BPM - A minor.wav', '02 Hats 4 bars - 124 BPM - A minor.wav', '03 Night bus song - 124 BPM - A minor.wav', 'Presets', 'README.txt'];
ok(JSON.stringify(files1) === JSON.stringify(expect1), 'the folder "Night bus — stems <date>": mix, 3 stems, the kick\'s MIDI, Presets, README.txt — tempo and key in every name: ' + files1.join(' | '));
ok(!(await listDir(OUT)).some(n => /\.part$/.test(n)) && (await listDir(OUT)).includes('keep.txt'), 'no staging folder left; the owner\'s own file is still there');
const presets1 = await listDir(`${F1}${SEP}Presets`);
ok(presets1.includes('Vital - Bank pad.vital') && presets1.includes('Vital - Sound now.vital'), 'Presets/: the pad\'s bank preset and the sound in Vital right now, as .vital files: ' + presets1.join(' | '));
ok(JSON.parse(new TextDecoder().decode(new Uint8Array(await hub.fs.read(`${F1}${SEP}Presets${SEP}Vital - Bank pad.vital`, { encoding: 'buffer' })))) && true, 'the preset file is Vital\'s JSON');
const wavs1 = expect1.filter(n => n.endsWith('.wav')), total1 = R(4 * bf);
for (const n of wavs1) { const hd = await header(`${F1}${SEP}${n}`); if (!(hd.format === 1 && hd.bits === 24 && hd.rate === 48000 && hd.channels === 2)) throw Error(`${n}: ${JSON.stringify(hd)}`); }
ok(true, 'every WAV: PCM, 24-bit, 48 kHz, stereo');
const [mix1, k1, h1, s1] = await Promise.all(wavs1.map(n => readWav(`${F1}${SEP}${n}`)));
ok([mix1, k1, h1, s1].every(x => x.channels[0].length === total1), `every WAV is exactly ${total1} samples (4 bars at 124 BPM, the longest part rounded up to the bar): ${[mix1, k1, h1, s1].map(x => x.channels[0].length).join(', ')}`);
ok(near(k1.channels[0][4800], 0.5) && near(k1.channels[0][R(bf) + 4800], 0.5) && k1.channels[0][4799] === 0 && near(mix1.channels[0][4800], 0.5) && near(mix1.channels[1][R(bf) + 4800], 0.5), 'the kick\'s clicks at samples 4,800 and bar 2 + 4,800: in its stem and in the mix (both channels)');
ok(near(h1.channels[0][R(bf / 2)], 0.25) && near(h1.channels[0][R(3 * bf)], 0.25) && h1.channels[1][R(3 * bf)] === 0 && near(mix1.channels[0][R(3 * bf)], 0.25), 'the hats\' clicks at the same samples in the stem and in the mix (left only where the source was left only)');
ok(near(s1.channels[0][1234], 0.375) && near(s1.channels[0][R(3.3 * bf) - 1], 0.375) && s1.channels[0][R(3.3 * bf)] === 0 && s1.channels[0][total1 - 1] === 0 && near(mix1.channels[0][1234], 0.375), 'the one-shot: first click at 1,234, last sample kept, silence after it to the 4th bar line');
let err1 = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < total1; i += 3) err1 = Math.max(err1, Math.abs(mix1.channels[c][i] - k1.channels[c][i] - h1.channels[c][i] - s1.channels[c][i]));
ok(err1 <= 2 * lsb, `the stems add up to the mix (within ${(err1 / lsb).toFixed(1)} LSB)`);
const mid = new Uint8Array(await hub.fs.read(`${F1}${SEP}01 Kick 2 bars - 124 BPM - A minor.mid`, { encoding: 'buffer' })), find = (arr, seq) => { for (let i = 0; i < arr.length - seq.length; i++) if (seq.every((x, j) => arr[i + j] === x)) return i; return -1; };
const tp = find(mid, [0xff, 0x51, 3]) + 3, firstOn = find(mid, [0x90, 57]);
ok(String.fromCharCode(...mid.slice(0, 4)) === 'MThd' && ((mid[tp] << 16) | (mid[tp + 1] << 8) | mid[tp + 2]) === R(60e6 / BPM) && firstOn > 0 && mid[firstOn - 1] === R(0.1 * BPM / 60 * 480), 'the kick\'s MIDI: 124 BPM, its first note (A) 0.1 s after bar 1 (99 ticks), where it was played');
const readme1 = new TextDecoder().decode(new Uint8Array(await hub.fs.read(`${F1}${SEP}README.txt`, { encoding: 'buffer' })));
ok(/Tempo: 124 BPM, 4\/4/.test(readme1) && /Key: A minor \(guessed from your notes\)/.test(readme1) && /Length: 4 bars/.test(readme1) && /drop all the WAVs in at bar 1/.test(readme1) && /- 02 Hats 4 bars - 124 BPM - A minor\.wav: stem: pad 2 of “Night bus”/.test(readme1) && /Presets\/Vital - Bank pad\.vital/.test(readme1), 'README.txt: tempo, key, length, how to drop them at bar 1, and what each file is');
await click('.dw-panel button', /^✕$/); ok(!panel(), '✕ closes the panel');
await click('.lv-view button', /^✕$/); await until(() => !document.querySelector('.lv-view'), 4000, 'the Live set closed');

// 2. Arrange's 📤: Arrange chosen, Presets unticked
await click('.wb-sound-desk button', /^Arrange loops$/); await until(() => document.querySelector('.ls-view'), 8000, 'Arrange');
await click('.ls-view button', /^📤 Send to my DAW$/);
await until(() => panel() && DawSend._test.info()?.src?.id === 'arrange', 10000, 'Arrange read');
ok(panel().querySelector('.dw-song').value === 'arrange' && /one WAV per lane \(2\)/.test(words()), 'Arrange\'s 📤 opens the panel on the Arrange song: one stem per lane (2)');
const pr = panel().querySelector('.dw-check input[data-what="presets"]'); pr.click(); await wait(20);
await click('.dw-panel button', /^📤 Send to my DAW$/); await until(() => panel().querySelector('.dw-done') && !DawSend._test.running(), 30000, 'Arrange sent');
const F2 = `${OUT}${SEP}Park song — stems ${date}`, files2 = await listDir(F2);
ok(JSON.stringify(files2) === JSON.stringify(['00 Mix - 124 BPM - A minor.wav', '01 Lane 1 Belleville - 124 BPM - A minor.mid', '01 Lane 1 Belleville - 124 BPM - A minor.wav', '02 Lane 2 Belleville - 124 BPM - A minor.wav', 'README.txt']), 'Arrange: mix + one stem per lane + lane 1\'s MIDI + README, and no Presets (unticked): ' + files2.join(' | '));
const [mix2, l1, l2] = await Promise.all(['00 Mix - 124 BPM - A minor.wav', '01 Lane 1 Belleville - 124 BPM - A minor.wav', '02 Lane 2 Belleville - 124 BPM - A minor.wav'].map(n => readWav(`${F2}${SEP}${n}`))), total2 = R(5 * bf);
ok([mix2, l1, l2].every(x => x.channels[0].length === total2), `Arrange: every WAV exactly ${total2} samples (5 bars: the hats run from bar 2 to bar 6)`);
const segs = S.schedule(S.validate(project.vst.song)), at = lane => segs.filter(s => s.lane === lane).map(s => R(s.at * 48000));
const kickAt = at(0).flatMap(a => [a + 4800, a + R(bf) + 4800]), hatsAt = at(1).flatMap(a => [a + R(bf / 2), a + R(3 * bf)]);
ok(kickAt.every(i => near(l1.channels[0][i], 0.5) && near(mix2.channels[0][i], 0.5)) && hatsAt.every(i => near(l2.channels[0][i], 0.25) && near(mix2.channels[0][i], 0.25)), `Arrange: every click on the song's bar grid, in its lane's stem and in the mix (samples ${[...kickAt, ...hatsAt].join(', ')})`);
let err2 = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < total2; i += 3) err2 = Math.max(err2, Math.abs(mix2.channels[c][i] - l1.channels[c][i] - l2.channels[c][i]));
ok(err2 <= 2 * lsb, `Arrange: the lane stems add up to the mix (within ${(err2 / lsb).toFixed(1)} LSB)`);
await click('.dw-panel button', /^✕$/); await click('.ls-view button', /^✕$/).catch(() => null);

// 3. the top row's 📤, then Cancel mid-way
await click('.wb-sound-desk button', /^📤 Send to my DAW$/); await until(() => panel() && DawSend._test.info(), 10000, 'the panel from the top row');
const sel = panel().querySelector('.dw-song'); sel.value = 'arrange'; sel.dispatchEvent(new Event('change')); await until(() => DawSend._test.info()?.src?.id === 'arrange', 8000, 'Arrange chosen');
const before = await listDir(OUT);
DawSend._test.slow(400); await click('.dw-panel button', /^📤 Send to my DAW$/);
await click('.dw-panel button', /^Cancel$/);
await until(() => !DawSend._test.running(), 15000, 'cancelled'); DawSend._test.slow(0);
const after = await listDir(OUT);
ok(panel().querySelector('.dw-said').textContent === 'Cancelled: nothing was left behind.' && JSON.stringify(after) === JSON.stringify(before) && !after.some(n => /\.part$|stems .* 2$/.test(n)), 'Cancel mid-way: "Cancelled: nothing was left behind." — no new folder, no staging folder (' + after.join(' | ') + ')');
ok(new TextDecoder().decode(new Uint8Array(await hub.fs.read(`${OUT}${SEP}keep.txt`, { encoding: 'buffer' }))) === 'the owner\'s file', 'the owner\'s file in that place is untouched');
ok(sent.length === 0, 'nothing was sent anywhere (fetch / XHR watched): ' + sent.join(' '));
await click('.dw-panel button', /^✕$/);
return JSON.stringify(out);
