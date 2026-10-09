#!/usr/bin/env node
// Unit + render tests for the cut (tools/cut-data.js): edit operations, program ↔ source time, snapping, beat
// suggestions, and real ffmpeg renders of an edit checked with ffprobe (durations, cut points by frame content).
//   node dev/cut-test.js [folder of test videos from dev/make-test-videos.sh]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../tools/cut-data.js');
const V = require('../tools/video-data.js');

let fails = 0; let passes = 0;
const ok = (name, cond, info) => { if (cond) passes += 1; else { fails += 1; console.log('✖', name, info === undefined ? '' : JSON.stringify(info)); } };
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// ---------- operations ----------
let e = C.fromSource('/a.mp4', 10);
ok('one clip', e.clips.length === 1 && near(C.total(e), 10));
ok('identity', C.isIdentity(e, '/a.mp4', 10));
e = C.split(e, 4);
ok('split → 2 clips', e.clips.length === 2 && near(e.clips[0].out, 4) && near(e.clips[1].in, 4), e.clips);
ok('split keeps the length', near(C.total(e), 10));
ok('not identity after split', !C.isIdentity(e, '/a.mp4', 10));
ok('split on a cut does nothing', C.split(e, 4).clips.length === 2);
e = C.split(e, 7);
ok('cuts', JSON.stringify(C.cuts(e)) === '[4,7]', C.cuts(e));
const lifted = C.remove(e, e.clips[1].id, { ripple: false });
ok('lift leaves a gap', lifted.clips[1].kind === 'gap' && near(C.total(lifted), 10));
const rippled = C.remove(e, e.clips[1].id);
ok('ripple delete closes it', rippled.clips.length === 2 && near(C.total(rippled), 7));
ok('at() after ripple maps to the source', near(C.at(rippled, 5).srcTime, 8), C.at(rippled, 5));
const rr = C.removeRange(C.fromSource('/a.mp4', 10), 2, 3);
ok('remove range', near(C.total(rr), 9) && rr.clips.length === 2 && near(rr.clips[1].in, 3));
const sl = C.slice(C.fromSource('/a.mp4', 10), 2, 5);
ok('slice keeps a..b', near(C.total(sl), 3) && near(sl.clips[0].in, 2) && near(sl.clips[0].out, 5), sl.clips);
let t = C.trim(e, e.clips[0].id, 'in', 1);
ok('trim in (ripple)', near(t.clips[0].in, 1) && near(C.total(t), 9));
t = C.trim(e, e.clips[2].id, 'out', 5);
ok('trim out clamps to the source', near(t.clips[2].out, 10), t.clips[2]);
t = C.trimTo(e, 5, 'in');
ok('Q trims the start to the playhead', near(t.clips[1].in, 5) && near(C.total(t), 9));
t = C.trimTo(e, 5, 'out');
ok('W trims the end to the playhead', near(t.clips[1].out, 5) && near(C.total(t), 8));
const mv = C.move(e, e.clips[2].id, 0);
ok('move to the front', mv.clips[0].id === e.clips[2].id && near(C.total(mv), 10));
const dup = C.duplicate(e, e.clips[0].id);
ok('duplicate', dup.clips.length === 4 && near(C.total(dup), 14) && dup.clips[1].src === '/a.mp4');
const sp = C.setSpeed(e, e.clips[0].id, 2);
ok('2× halves the clip', near(C.durOf(sp.clips[0]), 2) && near(C.total(sp), 8));
ok('at() through a 2× clip', near(C.at(sp, 1).srcTime, 2));
const sp4 = C.setSpeed(e, e.clips[0].id, 0.25);
ok('0.25× quadruples it', near(C.durOf(sp4.clips[0]), 16));
ok('mute', C.setMute(e, e.clips[0].id).clips[0].mute === true);
ok('fade clamps to half the clip', near(C.setFade(e, e.clips[0].id, 'in', 9).clips[0].fadeIn, 2));
const fr = C.freeze(e, 2, 1.5);
ok('freeze frame inserted', fr.clips.length === 5 && fr.clips[1].kind === 'freeze' && near(fr.clips[1].at, 2) && near(C.total(fr), 11.5), fr.clips.map((c) => c.kind));
const ti = C.title(e, 0, { text: 'Hello', dur: 2 });
ok('title card at the start', ti.clips[0].kind === 'title' && near(C.total(ti), 12));
const ap = C.append(e, '/b.mp4', 1, 3, 6);
ok('append another source', ap.clips.length === 4 && ap.clips[3].src === '/b.mp4' && near(C.total(ap), 12));
ok('sources', C.sources(ap).join() === '/a.mp4,/b.mp4');
ok('program times of a source time', JSON.stringify(C.programTimes(sp, '/a.mp4', 2)) === '[1]', C.programTimes(sp, '/a.mp4', 2));
const mk = C.addMarker(e, 3.3, 'drop');
ok('marker', mk.markers.length === 1 && mk.markers[0].label === 'drop');
ok('snap', C.snap(3.95, [{ t: 4, kind: 'cut' }, { t: 3, kind: 'beat' }], 0.1).t === 4 && C.snap(3.5, [{ t: 4 }], 0.1).snapped === null);
ok('atempo chain keeps pitch for 0.25×', C.atempo(0.25).join() === 'atempo=0.5,atempo=0.5' && C.atempo(4).join() === 'atempo=2,atempo=2' && C.atempo(1).length === 0 && C.atempo(1.5).join() === 'atempo=1.5');
ok('normalize drops broken clips', C.normalize({ clips: [{ kind: 'video', src: '/a', in: 1, out: 1 }, { kind: 'gap', dur: 1 }] }).clips.length === 1);

// beats: 120 bpm from 0.25 s
const beats = Array.from({ length: 40 }, (_, i) => 0.25 + i * 0.5);
const an = { '/a.mp4': { beats, drops: [4.25], sections: [{ start: 0, end: 4.25 }, { start: 4.25, end: 10 }] } };
const one = C.fromSource('/a.mp4', 10);
const bars = C.suggest(one, an, 'bars');
ok('suggest: every bar', bars.length === 4 && near(bars[0], 2.25) && near(bars[1], 4.25), bars);
ok('suggest: every 2 bars', C.suggest(one, an, '2bars').length === 2, C.suggest(one, an, '2bars'));
ok('suggest: drops', JSON.stringify(C.suggest(one, an, 'drops')) === '[4.25]');
ok('suggest: sections', JSON.stringify(C.suggest(one, an, 'sections')) === '[4.25]');
ok('suggest skips existing cuts', !C.suggest(C.split(one, 4.25), an, 'bars').includes(4.25));
const pb = C.programBeats(C.setSpeed(one, one.clips[0].id, 2), an);
ok('beats follow the speed', near(pb.beats[1], 0.375), pb.beats.slice(0, 3));

// ---------- ffmpeg renders ----------
const dir = process.argv[2] || '/tmp/hearth-test-videos';
let ff = null;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ff = 'ffmpeg'; } catch { /* no ffmpeg */ }
if (!ff || !fs.existsSync(path.join(dir, 'neon_tunnel_v1.mp4'))) {
  console.log(`(render tests skipped: ${ff ? `no test videos in ${dir}` : 'no ffmpeg'})`);
} else {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-test-'));
  const A = path.join(dir, 'neon_tunnel_v1.mp4'); const B = path.join(dir, 'neon_tunnel_v2.mp4'); const Q = path.join(dir, 'square_loop.mp4');
  const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f]).toString());
  const dur = (f, kind) => { const j = probe(f); const s = j.streams.find((x) => x.codec_type === kind); return Number(s?.duration || j.format.duration); };
  // mean colour of the frame at t (cut points: the v2 clip is hue-shifted, so frames tell which source shows)
  const frameAt = (f, ts) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ts), '-i', f, '-frames:v', '1', '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const diff = (x, y) => { let s = 0; for (let i = 0; i < x.length; i += 1) s += Math.abs(x[i] - y[i]); return s / x.length; };
  const info = { [A]: { w: 540, h: 960, fps: 30, audio: true }, [B]: { w: 540, h: 960, fps: 30, audio: true }, [Q]: { w: 540, h: 540, fps: 60, audio: true } };
  const canvas = { w: 540, h: 960, fps: 30 };
  const run = (edit, opts, name) => {
    const o = path.join(out, name);
    const { args, duration } = C.ffmpegArgs(edit, info, canvas, { ...opts, out: o, presetFilters: V.presetFilters, codecArgs: V.codecArgs });
    try { execFileSync('ffmpeg', ['-loglevel', 'error', ...args.slice(0, -1), '-t', String(duration + 1), args[args.length - 1]], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (err) { ok(`${name} renders`, false, String(err.stderr).slice(-600)); return null; }
    return { o, duration };
  };
  // A 0–2 · B 1–3 at 2× · freeze of A at 4 for 1 s · title gap · square clip 0–1 (letterboxed) · fades · muted part
  let ed = C.append(C.slice(C.fromSource(A, 6), 0, 2), B, 1, 3, 6);
  ed = C.setSpeed(ed, ed.clips[1].id, 2);
  ed = C.freeze(ed, C.total(ed), 1); // at the end: freeze of the last frame shown
  ed = { ...ed, clips: [...ed.clips, { id: 'g', kind: 'gap', dur: 0.5 }] };
  ed = C.append(ed, Q, 0, 1, 3);
  ed = C.setFade(ed, ed.clips[0].id, 'in', 0.3);
  ed = C.setMute(ed, ed.clips[4].id, true);
  const want = 2 + 1 + 1 + 0.5 + 1;
  ok('program length', near(C.total(ed), want), C.total(ed));
  const r = run(ed, {}, 'cut.mp4');
  if (r) {
    ok('video length = program', near(dur(r.o, 'video'), want, 0.08), dur(r.o, 'video'));
    ok('audio length = program', near(dur(r.o, 'audio'), want, 0.08), dur(r.o, 'audio'));
    // cut point 2 s: before = A at 1.9, after = B (hue-shifted) at 1 + 0.1*2
    const a19 = frameAt(A, 1.9); const b12 = frameAt(B, 1.2);
    const o19 = frameAt(r.o, 1.9); const o21 = frameAt(r.o, 2.1);
    ok('before the cut: source A', diff(o19, a19) < diff(o19, b12), [diff(o19, a19), diff(o19, b12)]);
    ok('after the cut: source B at 2×', diff(o21, b12) < diff(o21, a19), [diff(o21, b12), diff(o21, a19)]);
    const f1 = frameAt(r.o, 3.2); const f2 = frameAt(r.o, 3.8);
    ok('freeze frame holds still', diff(f1, f2) < 1, diff(f1, f2));
    const g = frameAt(r.o, 4.25);
    ok('gap is black', g.every((x) => x < 20), [...g].slice(0, 6));
    const p = probe(r.o).streams.find((s) => s.codec_type === 'video');
    ok('canvas size kept', p.width === 540 && p.height === 960, [p.width, p.height]);
  }
  const r2 = run(C.slice(ed, 1, 3), { preset: V.EXPORT_PRESETS.find((x) => x.id === 'square'), fit: 'crop' }, 'cut_square.mp4');
  if (r2) {
    const p = probe(r2.o).streams.find((s) => s.codec_type === 'video');
    ok('preset size (1:1)', p.width === 1080 && p.height === 1080, [p.width, p.height]);
    ok('in–out range length', near(dur(r2.o, 'video'), 2, 0.08), dur(r2.o, 'video'));
  }
  const r3 = run(C.slice(ed, 0, 1), { preset: V.EXPORT_PRESETS.find((x) => x.id === 'gif') }, 'cut.gif');
  if (r3) ok('GIF renders', fs.statSync(r3.o).size > 1000);
  const r4 = run(C.slice(ed, 0, 0.5), { stills: true }, 'still_%04d.png');
  if (r4) ok('PNG sequence', fs.readdirSync(out).filter((f) => /^still_\d+\.png$/.test(f)).length >= 14, fs.readdirSync(out));
  const r5 = run(C.slice(ed, 0, 2), { preset: V.EXPORT_PRESETS.find((x) => x.id === 'reels'), fit: 'blur' }, 'cut_reels_blur.mp4');
  if (r5) ok('blurred-fill preset', near(dur(r5.o, 'video'), 2, 0.08));
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(`${fails ? '✖' : '✓'} cut-test: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
