#!/usr/bin/env node
// Lyrics for the kinetic type layers (round 25, type), no Electron: tools/three-type-lyrics.js reads pasted lyrics,
// .lrc (with enhanced word times and [offset]) and .srt; aligns untimed lines onto a song's onsets near the beat (and
// words inside the lines); tightens timed lines; tap-along moves a line and the ones after it; writes LRC / SRT back.
//   node dev/type-test.js
const path = require('path');
const LY = require(path.join(__dirname, '..', 'tools', 'three-type-lyrics.js'));
const fails = [];
const ok = (what, fn) => { let r; try { r = fn(); } catch (e) { r = e.message; } console.log(`${r === true ? '✓' : '✖'} ${what}${r === true ? '' : ` → ${JSON.stringify(r)}`}`); if (r !== true) fails.push(what); };

// a 128 BPM song, 60 s: kicks on every beat from 2 s, snares on 2 and 4, a "vocal-ish" hit an eighth after some beats
const BPM = 128; const sp = 60 / BPM; const beats = []; const kick = []; const snare = []; const hats = [];
for (let t = 0.25; t < 60; t += sp) beats.push(+t.toFixed(4));
beats.forEach((t, i) => { if (t > 2) kick.push({ t }); if (i % 2 === 1) snare.push({ t }); hats.push({ t: +(t + sp / 2).toFixed(4) }); });
const music = { duration: 60, bpm: BPM, bpb: 4, downbeat: 0.25, beats, onsets: { kick, snare, hats }, sections: [{ start: 0, end: 8, label: 'Intro' }, { start: 8.06, end: 40, label: 'Verse' }, { start: 40, end: 52, label: 'Drop' }, { start: 52, end: 60, label: 'Outro' }] };
const allOn = [...kick, ...snare, ...hats].map((x) => x.t).sort((a, b) => a - b);
const nearOnset = (t, tol = 0.03) => allOn.some((x) => Math.abs(x - t) <= tol);

ok('kinds: plain, lrc, srt', () => LY.kindOf('hello\nworld') === 'plain' && LY.kindOf('[00:12.30]hi') === 'lrc' && LY.kindOf('1\n00:00:01,000 --> 00:00:02,000\nhi') === 'srt' && LY.kindOf('x', 'a.lrc') === 'lrc' || 'kinds');
ok('plain: blank lines, [Chorus] and (x2) dropped', () => { const r = LY.parse('[Verse 1]\nWe light the fire\n\n  tonight we burn  \n(x2)\n[Chorus]\nHearth hearth'); return r.kind === 'plain' && !r.timed && r.lines.map((x) => x.text).join('|') === 'We light the fire|tonight we burn|Hearth hearth' || r.lines; });
ok('lrc: times, tags, an empty line ends the one before, offset', () => {
  const r = LY.parse('[ti:Song]\n[ar:Me]\n[offset:+500]\n[00:10.50]First line here\n[00:14.00]\n[00:15.25]Second line\n[01:02.10]Third');
  const L = r.lines;
  return r.timed && L.length === 3 && L[0].a === 10 && L[0].b === 13.5 && L[1].a === 14.75 && L[1].b === 61.6 && L[2].a === 61.6 && L[2].b === null || L;
});
ok('lrc: a line with two stamps shows twice', () => { const r = LY.parse('[00:05.00][00:20.00]Again'); return r.lines.length === 2 && r.lines[1].a === 20 || r.lines; });
ok('lrc enhanced: word times', () => { const r = LY.parse('[00:01.00]<00:01.00>Hold <00:01.40>on <00:02.10>tight'); return r.lines[0].text === 'Hold on tight' && r.lines[0].w.join(',') === '1,1.4,2.1' || r.lines; });
ok('srt / vtt: cues, tags dropped, lines joined', () => { const r = LY.parse('1\n00:00:01,000 --> 00:00:03,500\n<i>Hello</i>\nthere\n\n2\n00:00:04.000 --> 00:00:05.000\nNext'); return r.kind === 'srt' && r.lines.length === 2 && r.lines[0].text === 'Hello there' && r.lines[0].b === 3.5 && r.lines[1].a === 4 || r.lines; });
ok('syllables', () => LY.syllables('fire') === 1 && LY.syllables('tonight') === 2 && LY.syllables('beautiful') >= 3 && LY.syllables('a') === 1 || [LY.syllables('fire'), LY.syllables('tonight'), LY.syllables('beautiful')]);

const TEXT = ['We light the fire', 'tonight we burn so bright', 'every spark a story', 'hearth and home', 'turn it up turn it up', 'we never sleep', 'until the morning comes', 'hold the line'];
const plain = LY.parse(TEXT.join('\n')).lines;
const al = LY.align(plain, music);
ok('align: every line has a start and an end, in order, inside the song', () => al.lines.every((L, i) => L.a != null && L.b > L.a && (i === 0 || L.a > al.lines[i - 1].a) && L.b <= 60) || al.lines);
ok('align: the lines start after the intro (8 s) and before the outro (52 s)', () => al.lines[0].a >= 7.9 && al.lines[al.lines.length - 1].a < 52 || al.lines.map((x) => x.a));
ok('align: every line starts on an onset (±30 ms)', () => al.lines.every((L) => nearOnset(L.a)) || al.lines.map((x) => x.a));
ok('align: no line overlaps the next', () => al.lines.every((L, i) => !al.lines[i + 1] || L.b <= al.lines[i + 1].a) || al.lines);
ok('align: longer lines get more time', () => { const d = al.lines.map((L, i) => (al.lines[i + 1] ? al.lines[i + 1].a : 52) - L.a); return d[1] > d[3] || d; });
ok('align: words, in order, inside their line, the first on the line\'s start', () => al.lines.every((L) => L.w.length === L.text.split(' ').length && L.w[0] === L.a && L.w.every((x, i) => x < L.b && (i === 0 || x > L.w[i - 1]))) || al.lines.map((x) => x.w));
ok('align: most words land on onsets', () => { const ws = al.lines.flatMap((L) => L.w.slice(1)); const n = ws.filter((t) => nearOnset(t)).length; return n / ws.length > 0.6 || `${n}/${ws.length}`; });
const timed = LY.parse('[00:10.03]We light the fire\n[00:14.27]tonight we burn').lines;
const tg = LY.align(timed, music);
ok('timed lines are only tightened onto a nearby onset (≤ 120 ms)', () => tg.lines.every((L, i) => nearOnset(L.a, 0.005) && Math.abs(L.a - timed[i].a) <= 0.12) && /timed/.test(tg.how) || tg.lines);
ok('no song (no onsets): lines still spread on the beat grid', () => { const r = LY.align(plain, { duration: 40, bpm: 120 }); return r.lines.every((L, i) => L.a != null && (i === 0 || L.a > r.lines[i - 1].a)) || r.lines; });

// tap-along: line 2 starts at 30.0 (the onset nearest within 80 ms), lines 3+ move by the same amount, 0 and 1 stay
const lines = al.lines.map((x) => ({ ...x, w: x.w.slice() }));
const before = lines.map((x) => x.a);
LY.tap(lines, 2, 30.02, music);
const want = allOn.reduce((b, x) => (Math.abs(x - 30.02) < Math.abs(b - 30.02) ? x : b), Infinity);
const d = lines[2].a - before[2];
ok('tap: the line starts at the tap (snapped to an onset ≤ 80 ms)', () => Math.abs(lines[2].a - want) < 0.002 && Math.abs(want - 30.02) <= 0.08 || [lines[2].a, want]);
ok('tap: the lines after it move with it, the ones before stay', () => lines[0].a === before[0] && lines[1].a === before[1] && lines.slice(3).every((L, i) => Math.abs(L.a - (before[i + 3] + d)) < 0.002) || lines.map((x) => x.a));
ok('tap: the line before now ends before it', () => lines[1].b <= lines[2].a || [lines[1].b, lines[2].a]);
const tapped = new Set([2]);
LY.tap(lines, 1, before[1] + 0.5, music, { tapped });
ok('tap: an earlier line moves the ones up to a line already tapped, not past it', () => Math.abs(lines[2].a - want) < 0.002 || lines.map((x) => x.a));
ok('shift: every time moves', () => { const s = LY.shift(al.lines, 0.25); return s.every((L, i) => Math.abs(L.a - al.lines[i].a - 0.25) < 1e-6 && Math.abs(L.w[0] - al.lines[i].w[0] - 0.25) < 1e-6) || s; });
ok('LRC out and back in', () => { const t = LY.toLRC(al.lines); const r = LY.parse(t); return r.lines.length === al.lines.length && r.lines.every((L, i) => Math.abs(L.a - al.lines[i].a) <= 0.006 && L.text === al.lines[i].text) || t; });
ok('LRC with word times out and back in', () => { const r = LY.parse(LY.toLRC(al.lines.slice(0, 2), { words: true })); return r.lines[1].w.every((x, i) => Math.abs(x - al.lines[1].w[i]) <= 0.006) || r.lines; });
ok('SRT out and back in', () => { const r = LY.parse(LY.toSRT(al.lines)); return r.kind === 'srt' && r.lines.length === al.lines.length && Math.abs(r.lines[3].b - al.lines[3].b) <= 0.001 || r.lines; });
ok('pack / unpack (the layer code\'s form)', () => { const u = LY.unpack(LY.pack(al.lines)); return u.length === al.lines.length && u[2].text === al.lines[2].text && u[2].w.length === al.lines[2].w.length && JSON.stringify(LY.pack(al.lines)).length < 2000 || JSON.stringify(LY.pack(al.lines)).length; });

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
