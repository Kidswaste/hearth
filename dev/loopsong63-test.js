// (round 63, loopsong63) From park loops to a song, without a sound card, the app or the real plugins:
//   1. tools/loopsong-core.js: the arrangement model (lanes, clips, snapping to bars / beats, repeat, trim, fades), the
//      song's tempo from the takes, the tempo plan (stretch when close, otherwise its own tempo + a warning), the
//      schedule, the mixdown math (fades, lane gain, mute, −1 dBFS normalize, the stems adding up to the mix — also after
//      16-bit WAV files), the pitch-keeping time-stretch, the song's MIDI, the re-render's notes and realignment,
//      export names under parkSave's rules, the proof text against Codex's QuestCore.checkProof.
//   2. the "Finish a track" personal quest (tools/quest-paris.js) = the core's fallback template; startPersonal works.
//   3. creative-vstmain.js parkList (every park sketch's takes) and parkMp3 (ffmpeg, atomic; skipped plainly without it).
//   node dev/loopsong63-test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { execFileSync } = require('child_process');
const S = require('../tools/loopsong-core.js'), P = require('../tools/parkjam-core.js'), C = require('../tools/quest-core.js'), Q = require('../tools/quest-paris.js');
const { parkSave, parkList, parkMp3 } = require('../creative-vstmain');
const out = { checks: 0, skipped: [] }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

(async () => {
  // ---- 1. the model
  const take = (o = {}) => ({ id: 't' + Math.random().toString(36).slice(2, 6), sketch: 'Park sketch · Belleville · 18 Oct', place: 'Belleville', bars: 4, beats: 4, bpm: 120, seconds: 8, loop: '/x/Belleville loop.wav', layered: '/x/Belleville loop layered.wav', midi: '/x/a.mid', notes: 3, instrument: 'Vital', ...o });
  const tA = take(), tB = take({ place: 'Buttes-Chaumont', sketch: 'Park sketch · Buttes-Chaumont · 12 Oct', layered: null }), tC = take({ bpm: 110, bars: 8 }), tFar = take({ bpm: 80 });
  ok(S.tempoFrom([tA, tC, tB]) === 120 && S.tempoFrom([tC, tC, tA]) === 110 && S.tempoFrom([]) === null, 'the song\'s tempo: the one most takes were played at');
  const s = S.create({ title: 'Sunday', sketch: tA.sketch }); ok(s.lanes.length === 5 && s.lanes[S.RERENDER].rerender && s.bpm === null, 'four lanes + the re-render lane; no tempo before a take');
  const a = S.addClip(s, tA); ok(s.bpm === 120 && s.beats === 4 && a.start === 0 && a.in === 0 && a.out === 16 && a.ambience === true, 'the first take sets the tempo; a clip covers its whole loop, ambience on when the take has one');
  const b = S.addClip(s, tA); ok(b.start === 4, 'the next clip on a lane goes after the last one (bar 5)');
  const c = S.addClip(s, tB, { lane: 1, bar: 2.6 }); ok(c.start === 3 && c.lane === 1 && c.ambience === false, 'snapped to the nearest bar (2.6 → 3); a dry take has no ambience');
  S.move(s, c.id, { bar: -5, lane: 9 }); ok(c.start === 0 && c.lane === 4, 'moves stay inside bar 1+ and the five lanes'); S.move(s, c.id, { lane: 1, bar: 3.4 }); ok(c.start === 3 && c.lane === 1, 'move snaps too');
  S.trim(c, 2.4, 1.2); ok(c.in === 2 && c.out === 3, 'trim snaps to whole beats and keeps at least one'); S.trim(c, -3, 99); ok(c.in === 0 && c.out === 16, 'trim stays inside the take');
  S.repeat(s, c.id, 3); ok(c.repeat === 3 && near(S.span(s, c).bars, 12), 'repeat ×3 → 12 bars'); S.repeat(s, c.id, 0); ok(c.repeat === 1, 'at least once');
  S.fade(s, a.id, { fadeIn: 0.5, fadeOut: 99 }); ok(a.fadeIn === 0.5 && a.fadeOut === 30, 'fades bounded');
  ok(S.bars(s) === 8 && near(S.duration(s), 16), 'the song: 8 bars, 16 s at 120 BPM');
  const back = S.validate(JSON.parse(JSON.stringify(s))); ok(back.clips.length === 3 && back.clips[2].start === 3 && back.bpm === 120 && back.lanes.length === 5, 'a saved song reads back the same');
  ok(S.validate({ bpm: 9999, clips: [{ take: {} }, null], lanes: [{ mute: 1 }] }).clips.length === 0 && S.validate({ bpm: 9999 }).bpm === null, 'a damaged song reads back safe');
  // ---- tempo plan and warnings
  const d = S.addClip(s, tC, { lane: 2, bar: 0 }), e = S.addClip(s, tFar, { lane: 3, bar: 0 });
  let p = S.tempoPlan(s, a); ok(p.ratio === 1 && !p.stretch && !p.warn, 'same tempo: nothing to do');
  p = S.tempoPlan(s, d); ok(p.stretch && near(p.ratio, 120 / 110) && !p.warn, '110 BPM take in a 120 BPM song: time-stretched (pitch kept)');
  ok(near(S.span(s, d).seconds, 32 * 60 / 120), 'a stretched 8-bar take fills 8 bars of the song');
  p = S.tempoPlan(s, e); ok(!p.stretch && /80 BPM in a 120 BPM song .*too far.*drifts/.test(p.warn), '80 BPM in a 120 BPM song: too far to stretch → its own tempo + a warning');
  d.stretch = false; p = S.tempoPlan(s, d); ok(!p.stretch && /stretching is off/.test(p.warn), 'stretch turned off: a warning');
  let w = S.warnings(s); ok(w.length === 2 && w.some(x => /80 BPM/.test(x)) && w.some(x => /110 BPM/.test(x)), 'warnings list both mismatches: ' + w.join(' | '));
  d.stretch = true; S.remove(s, e.id); ok(S.warnings(s).length === 0, 'no mismatch left, no warning');
  const r = S.addClip(s, tA, { lane: S.RERENDER, bar: 0 }); ok(S.warnings(s).some(x => /re-render lane: choose a preset/.test(x)) && !S.schedule(s).some(g => g.clip === r.id), 'a clip on the re-render lane is silent until re-rendered (and says so)');
  r.rerender = { file: '/x/rr.wav', preset: 'Bright pad', instrument: 'Vital' }; ok(S.schedule(s).some(g => g.clip === r.id && g.source === 'rerender') && S.sourceOf(s, r).file === '/x/rr.wav', 'once re-rendered it plays its own file');
  S.remove(s, r.id); S.remove(s, d.id);
  // ---- schedule
  const g = S.schedule(s); ok(g.length === 3 && g[0].at === 0 && g.find(x => x.clip === b.id).at === 8 && g.find(x => x.clip === c.id).at === 6 && g.every(x => x.dur === 8), 'the schedule: where each clip plays, in seconds');
  a.ambience = false; ok(S.schedule(s)[0].source === 'loop' && S.sourceOf(s, a).file === tA.loop, 'ambience off for one clip: its dry loop'); a.ambience = true; ok(S.sourceOf(s, a).file === tA.layered, 'ambience on: the layered loop');
  S.repeat(s, c.id, 2); S.trim(c, 4, 8); const segs = S.schedule(s).filter(x => x.clip === c.id); ok(segs.length === 2 && segs[0].offset === 2 && segs[0].dur === 2 && segs[1].at === 8 && segs[0].first && segs[1].last, 'trim (beats 4–8) and repeat ×2: two 1-bar segments from 2 s into the take');

  // ---- 2. the mixdown math
  const R = 1000, sec = n => new Float32Array(n * R), dc = (v, n) => sec(n).fill(v);
  const m = S.create({ title: 'Math', rate: 1000 }); m.rate = 1000;
  const x1 = S.addClip(m, take({ bars: 1, bpm: 60, beats: 4 }), { lane: 0, bar: 0 }), x2 = S.addClip(m, take({ bars: 1, bpm: 60, beats: 4, layered: null }), { lane: 1, bar: 0 }), x3 = S.addClip(m, take({ bars: 1, bpm: 60, beats: 4, layered: null }), { lane: 2, bar: 1 });
  x1.fadeIn = 1; x1.fadeOut = 1;
  const src = { [x1.id]: { rate: R, channels: [dc(.5, 4), dc(.25, 4)] }, [x2.id]: { rate: R, channels: [dc(.3, 4), dc(.3, 4)] }, [x3.id]: { rate: R, channels: [dc(-.4, 4), dc(.4, 4)] } };
  let mix = S.render(m, src, { rate: R });
  ok(mix.length === 8000 && mix.lanes[3] === null && mix.lanes[0][0].length === 8000, 'mix length = the song (8 s), lanes that play nothing are empty');
  ok(near(mix.lanes[0][0][500], .25, 1e-3) && near(mix.lanes[0][0][2000], .5) && near(mix.lanes[0][0][3500], .25, 1e-3) && near(mix.lanes[0][1][2000], .25), 'fades: half way up after 0.5 s of a 1 s fade in, half way down 0.5 s before the end');
  ok(near(mix.mix[0][2000], .8) && near(mix.mix[0][5000], -.4) && near(mix.mix[1][5000], .4) && near(mix.mix[0][4500], -.4), 'lanes sum into the mix (left / right kept)');
  ok(mix.lanes[1][0][1] < .3 && near(mix.lanes[1][0][2], .3), '2 ms edge ramps where a clip has no fade (no clicks)');
  m.lanes[1].gain = -6; mix = S.render(m, src, { rate: R }); ok(near(mix.lanes[1][0][2000], .3 * 10 ** (-6 / 20), 1e-6), 'lane gain in dB');
  m.lanes[1].gain = 0; x2.gain = 6; mix = S.render(m, src, { rate: R }); ok(near(mix.lanes[1][0][2000], .3 * 10 ** (6 / 20), 1e-6), 'clip gain in dB'); x2.gain = 0;
  m.lanes[2].mute = true; mix = S.render(m, src, { rate: R }); ok(near(mix.mix[0][5000], 0) && near(mix.lanes[2][0][5000], -.4), 'a muted lane leaves the mix (its own stem still renders)'); m.lanes[2].mute = false;
  mix = S.render(m, src, { rate: R }); const n = S.normalize(mix, -1);
  ok(near(n.peak, 10 ** (-1 / 20), 1e-9) && near(Math.max(...n.mix[0].map(Math.abs), ...n.mix[1].map(Math.abs)), 10 ** (-1 / 20), 1e-6) && near(n.gainDb, -1 - 20 * Math.log10(.8), 1e-6), `normalized to −1 dBFS (gain ${n.gainDb.toFixed(2)} dB)`);
  let worst = 0; for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n.length; i++) worst = Math.max(worst, Math.abs(n.lanes[0][ch][i] + n.lanes[1][ch][i] + n.lanes[2][ch][i] - n.mix[ch][i]));
  ok(worst < 1e-6, `stems sum to the mix (max difference ${worst.toExponential(1)})`);
  const q = a => P.decodeWav(P.encodeWav({ rate: R, channels: a })).channels; const qm = q(n.mix), ql = [0, 1, 2].map(k => q(n.lanes[k])); worst = 0;
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n.length; i++) worst = Math.max(worst, Math.abs(ql[0][ch][i] + ql[1][ch][i] + ql[2][ch][i] - qm[ch][i]));
  ok(worst <= 4 / 32768, `…and as 16-bit WAV files too (max ${Math.round(worst * 32768)} LSB)`);
  ok(S.normalize({ ...mix, peak: 0 }).gain === 1, 'silence stays silence (no division by zero)');

  // ---- 3. time-stretch (WSOLA): tempo moves, pitch stays
  const rate = 48000, sine = new Float32Array(rate * 2); for (let i = 0; i < sine.length; i++) sine[i] = .5 * Math.sin(2 * Math.PI * 440 * i / rate);
  const zc = x => { let k = 0; for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) k++; return k; };
  for (const ratio of [120 / 110, 0.85]) {
    const [st] = S.stretch([sine], ratio), core = st.subarray(4096, st.length - 4096), f = zc(core) / (core.length / rate);
    const rms = Math.sqrt(core.reduce((acc, v) => acc + v * v, 0) / core.length);
    ok(st.length === Math.round(sine.length / ratio) && Math.abs(f - 440) < 440 * .015 && Math.abs(rms - .5 / Math.SQRT2) < .04, `stretch ×${ratio.toFixed(3)}: ${st.length} samples, ${f.toFixed(1)} Hz (440 kept), level kept (rms ${rms.toFixed(3)})`);
  }
  const prep = S.prepare({ rate: 44100, channels: [new Float32Array(44100).fill(.2)] }, { rate: 48000, ratio: 1 }); ok(prep.channels.length === 2 && prep.channels[1].length === 48000 && near(prep.channels[1][100], .2), 'a mono 44.1 kHz take → stereo at the song\'s 48 kHz');

  // ---- 4. MIDI and the re-render
  const notes = [{ note: 60, time: 0, length: .5, velocity: 90 }, { note: 64, time: 1, length: .5 }, { note: 67, time: 2.5, length: 3 }];
  const mm = S.create({ title: 'Notes' }), y = S.addClip(mm, take({ bars: 1, bpm: 120 }), { lane: 0, bar: 1 }); S.repeat(mm, y.id, 2);
  let sn = S.songNotes(mm, { [y.id]: notes }); ok(sn.length === 4 && sn[0].time === 2 && sn[1].time === 3 && sn[2].time === 4 && sn[3].note === 64 && sn[0].velocity === 90, 'the song\'s notes: each repeat, from bar 2 (2 s), the 2.5 s note (beat 5) left out of a 1-bar loop');
  S.trim(y, 2, 4); sn = S.songNotes(mm, { [y.id]: notes }); ok(sn.length === 2 && sn[0].note === 64 && sn[0].time === 2 && sn[1].time === 3, 'trimmed (beats 2–4): only the note inside, at the clip\'s start');
  const ys = S.create({ title: 'Stretch' }); ys.bpm = 120; const yy = S.addClip(ys, take({ bars: 1, bpm: 110 }), { lane: 0, bar: 0 }); sn = S.songNotes(ys, { [yy.id]: [{ note: 60, time: 60 / 110, length: 60 / 110 }] }); ok(near(sn[0].time, .5, 1e-6) && near(sn[0].length, .5, 1e-6), 'a stretched clip\'s notes land on the song\'s beats');
  const mid = P.midiFile(sn, { bpm: 120, beats: 4, name: 'x' }); ok(String.fromCharCode(...mid.subarray(0, 4)) === 'MThd', 'MIDI file written (parkjam62\'s writer)');
  mm.lanes[0].mute = true; ok(S.songNotes(mm, { [y.id]: notes }).length === 0, 'a muted lane\'s notes stay out of the song\'s MIDI');
  const rr = S.rerenderNotes(take(), [{ note: 62, time: .75, length: .25 }, { note: 60, time: .25, length: .5 }, { note: 200, time: 0, length: 1 }]);
  ok(rr.lead === .25 && rr.notes.length === 2 && rr.notes[0].time === 0 && rr.notes[1].time === .5, 're-render notes start at the first note (the recorder starts there); bad notes dropped');
  const al = S.realign({ rate: 10, channels: [Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1])] }, .25, 8); ok(Array.from(al.channels[0]).join('') === '00011111' || Array.from(al.channels[0]).join('') === '00111111', 'the lead-in silence goes back in front, cut to the take\'s length: ' + Array.from(al.channels[0]).join(''));

  // ---- 5. names, proof, the quest
  const names = S.exportNames({ title: 'Sunday / at the park?' }, new Date(2026, 9, 18, 15, 4, 9)), re = /^[\w .·-]{1,80}\.(wav|mid|json)$/i;
  ok([names.mix, names.midi, names.json, names.stem(0), names.stem(4)].every(x => re.test(x) && x.length <= 80) && /\.mp3$/.test(names.mp3) && /stem 5 Re-render\.wav$/.test(names.stem(4)), 'export names follow parkSave\'s rules: ' + names.stem(4));
  const text = S.proofText(s, P.analyse({ rate: 1000, channels: n.mix }), { stems: 3, mp3: true });
  C.checkProof({ type: 'file', title: names.mix, path: '/tmp/x.wav', kind: 'audio/wav', bytes: 10, fingerprint: 'a'.repeat(64), images: [], ...text }); out.checks++;
  ok(/Park song · Sunday · \d+ bars at 120 BPM/.test(text.excerpt) && /cannot hear/.test(text.coverage), 'the proof text passes Codex\'s checkProof, honest coverage');
  const T = Q.findPersonal('track'); ok(T && T.id === 'c-pq-track' && T.title === 'Finish a track', 'the "Finish a track" personal quest is in the Paris quests');
  ok(JSON.stringify(T.steps) === JSON.stringify(S.TRACK_QUEST.steps) && T.id === S.TRACK_QUEST.id, 'the fallback template matches it (no drift)');
  ok(Q.findPersonal('music')?.key === 'park' && Q.findPersonal('finish')?.key === 'track', 'other personal quests still found by their words');
  const st = C.upgrade(C.initial()), camp = Q.startPersonal(st, 'track'); const first = C.next(st, camp);
  C.submit(st, first.id, C.checkProof({ type: 'file', title: names.mix, path: '/tmp/x.wav', kind: 'audio/wav', bytes: 10, fingerprint: 'b'.repeat(64), images: [], ...text }), 'song'); ok(camp.quests.length === 3 && st.submissions[first.id].length === 1 && !C.done(st, first.id), 'startPersonal("track") adds it to the journal; the song is saved as proof, no XP before a review');

  // ---- 6. main side: every park sketch's takes, the MP3
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'loopsong63-'));
  try {
    const wav = P.encodeWav({ rate: 48000, channels: [sine.subarray(0, 48000), sine.subarray(0, 48000)] });
    for (const [sk, place] of [['Park sketch · Belleville · 18 Oct', 'Belleville'], ['Park sketch · Buttes-Chaumont · 12 Oct', 'Buttes-Chaumont']]) {
      const nm = P.takeNames(place, new Date(2026, 9, 12)), loop = parkSave(temp, sk, nm.loop, wav);
      parkSave(temp, sk, nm.notes, JSON.stringify({ v: 1, id: 'take-' + place, at: '2026-10-1' + (place === 'Belleville' ? 8 : 2), sketch: sk, place, bars: 4, beats: 4, bpm: 120, loop, notes: 2, notesPlayed: notes }));
    }
    parkSave(temp, 'Park sketch · Belleville · 18 Oct', names.json, '{"v":1,"kind":"park-song","loop":"x","bpm":1,"bars":1}');
    parkSave(temp, 'Park sketch · Belleville · 18 Oct', 'other.json', '{"hello":1}');
    const list = parkList(temp); ok(list.takes.length === 2 && list.takes[0].place === 'Belleville' && list.takes[1].sketch === 'Park sketch · Buttes-Chaumont · 12 Oct' && !list.takes[0].notesPlayed && /\.json$/.test(list.takes[0].notesFile), 'parkList: the takes of every park sketch, newest first (not the song, not other JSON)');
    ok(parkList(path.join(temp, 'nothing')).takes.length === 0, 'no park folder yet: no takes');
    const mixName = parkSave(temp, 'Park sketch · Belleville · 18 Oct', names.mix, wav);
    ok(!(await parkMp3(temp, 'Park sketch · Belleville · 18 Oct', names.mix, null)).ok, 'no ffmpeg: the MP3 is skipped plainly');
    ok(!(await parkMp3(temp, 'Park sketch · Belleville · 18 Oct', '../../x.wav', '/bin/true')).ok && !(await parkMp3(temp, 'Park sketch · Belleville · 18 Oct', 'missing.wav', '/bin/true')).ok, 'the MP3 only reads a mix in the sketch\'s own folder');
    let ff = null; try { ff = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg']).toString().split(/\r?\n/)[0].trim() || null; } catch { ff = null; }
    if (ff) { const r2 = await parkMp3(temp, 'Park sketch · Belleville · 18 Oct', names.mix, ff); ok(r2.ok && r2.path === mixName.replace(/\.wav$/, '.mp3') && fs.statSync(r2.path).size > 1000 && !fs.existsSync(r2.path + '.part'), 'with ffmpeg: the MP3 next to the mix (written atomically)'); }
    else out.skipped.push('MP3 with ffmpeg (not installed here)');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  console.log(JSON.stringify({ pass: true, ...out }));
})().catch(err => { console.error(err); console.log(JSON.stringify({ pass: false, error: err.message, ...out })); process.exit(1); });
