#!/usr/bin/env node
// Unit + render tests for the video editor's model (tools/cut-data.js), presets (tools/cut-presets.js) and the full
// ffmpeg render (tools/cut-ffmpeg.js): tracks, transitions, roll / slip / slide, overwrite, keyframes, looks,
// reverse, ramps, overlays, blend modes, audio tracks, in–out, export presets. Renders are checked with ffprobe and
// by reading the frame numbers burned into the test clips (dev/make-editor-videos.js).
//   node dev/make-editor-videos.js /tmp/ev && node dev/editor-test.js /tmp/ev
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../tools/cut-data.js');
global.CutData = C;
const FX = require('../tools/cut-presets.js');
global.EditFX = FX;
const FFX = require('../tools/cut-ffmpeg.js');
const V = require('../tools/video-data.js');
const { decodeFrameCode } = require('./editor-frames.js');

const DIR = process.argv[2] || '/tmp/hearth-editor-videos';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
let pass = 0; let fail = 0;
const ok = (name, cond, info) => { if (cond) pass += 1; else { fail += 1; console.log(`✖ ${name}${info !== undefined ? ` · ${JSON.stringify(info)}` : ''}`); } };
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const A = path.join(DIR, 'frames_a_30.mp4'); const B = path.join(DIR, 'frames_b_30.mp4'); const Cc = path.join(DIR, 'frames_c_25.mp4');
const S = path.join(DIR, 'frames_silent_24.mp4'); const STILL = path.join(DIR, 'still.png'); const MUSIC = path.join(DIR, 'music.wav');
const info = { [A]: { w: 540, h: 960, fps: 30, audio: true }, [B]: { w: 540, h: 960, fps: 30, audio: true }, [Cc]: { w: 960, h: 540, fps: 25, audio: true }, [S]: { w: 640, h: 640, fps: 24, audio: false }, [STILL]: { w: 800, h: 600 }, [MUSIC]: { audio: true } };
const canvas = { w: 540, h: 960, fps: 30 };

// ---------- model ----------
let e = C.fromSource(A, 6);
e = C.split(e, 2); e = C.split(e, 4);
ok('3 clips after two splits', e.clips.length === 3);
const e2 = C.setTrans(e, e.clips[1].id, 'dissolve', 0.5);
ok('a transition overlaps: the edit is 0.5 s shorter', near(C.total(e2), 5.5));
ok('cut point is the middle of the transition', near(C.cuts(e2)[0], 1.75));
ok('transAll sets every cut', C.transAll(e, 'wipe-left', 0.4).clips.slice(1).every((c) => c.trans?.type === 'wipe-left'));
const rolled = C.roll(e, 1, 0.5);
ok('roll moves the cut, total unchanged', near(C.total(rolled), 6) && near(rolled.clips[0].out, 2.5) && near(rolled.clips[1].in, 2.5));
const slipped = C.slip(e, e.clips[1].id, 1);
ok('slip shifts the source window, same length', near(slipped.clips[1].in, 3) && near(slipped.clips[1].out, 5) && near(C.total(slipped), 6));
const slid = C.slide(e, e.clips[1].id, 0.5);
ok('slide: neighbours trim, the clip keeps its content', near(slid.clips[0].out, 2.5) && near(slid.clips[1].in, 2) && near(slid.clips[1].out, 4) && near(slid.clips[2].in, 4.5) && near(C.total(slid), 6), C.describe(slid));
const ow = C.overwrite(e, 1, C.videoClip(B, 0, 1, 6));
ok('overwrite replaces 1 s without ripple', near(C.total(ow), 6) && ow.clips.some((c) => c.src === B), C.describe(ow));
ok('lift leaves a gap', C.lift(e, 1, 2).clips.some((c) => c.kind === 'gap') && near(C.total(C.lift(e, 1, 2)), 6));
ok('extract closes it', near(C.total(C.extract(e, 1, 2)), 5));
let k = C.setKey(e, e.clips[0].id, 'opacity', 0, 0, 'linear'); k = C.setKey(k, e.clips[0].id, 'opacity', 1, 1);
ok('keyframes: linear value', near(C.propAt(k.clips[0], 'opacity', 0.5), 0.5));
ok('keyframes: hold after the last key', near(C.propAt(k.clips[0], 'opacity', 1.8), 1));
const ks = C.split(k, 0.5);
ok('split keeps the curve on both halves', near(C.propAt(ks.clips[0], 'opacity', 0.5), 0.5, 0.02) && near(C.propAt(ks.clips[1], 'opacity', 0), 0.5, 0.02) && near(C.propAt(ks.clips[1], 'opacity', 0.5), 1, 0.02));
const ramped = C.ramp(e, e.clips[0].id, FX.RAMP['slow-mid'].speeds);
ok('ramp: 8 steps, longer (slow-mo)', ramped.clips.length === 10 && C.total(ramped) > 6);
const rev = C.setReverse(e, e.clips[0].id, true);
ok('reverse: source time runs backwards', near(C.at(rev, 0.5).srcTime, 1.5));
const rs = C.split(rev, 0.5);
ok('split of a reversed clip', near(rs.clips[0].in, 1.5) && near(rs.clips[0].out, 2) && near(rs.clips[1].out, 1.5));
let t = C.addItem(e, { kind: 'title', text: 'Hi', start: 1, dur: 2 });
ok('a title item makes a text track', t.tracks?.[0]?.type === 'text' && t.tracks[0].items.length === 1);
t = C.addItem(t, { kind: 'video', src: B, in: 0, out: 2, max: 6, start: 3 });
ok('an overlay video makes V2', t.tracks.some((x) => x.type === 'video' && x.name === 'V2'));
t = C.addItem(t, { kind: 'video', src: B, in: 0, out: 2, max: 6, start: 3.5 });
ok('an overlapping overlay goes on V3', t.tracks.filter((x) => x.type === 'video').length === 2);
ok('total covers the items', near(C.total(C.addItem(e, { kind: 'title', text: 'x', start: 5.5, dur: 2 })), 7.5));
const si = C.splitItems(t, 4);
ok('split items at 4 s', si.tracks.filter((x) => x.type === 'video').reduce((n, x) => n + x.items.length, 0) === 4);
const mi = C.moveItem(t, t.lastItem, 0.5);
ok('move an item', near(C.find(mi, t.lastItem).clip.start, 0.5));
const ti = C.trimItem(t, t.lastItem, 'out', 4.5);
ok('trim an item', near(C.itemEnd(C.find(ti, t.lastItem).clip), 4.5));
ok('isRich for tracks / transitions; plain cuts are not', C.isRich(t) && C.isRich(e2) && !C.isRich(e));
ok('stackAt lists the layers at a time', C.stackAt(t, 3.6).length === 3);
ok('describeAll has tracks', C.describeAll(t).some((l) => /^V2 /.test(l)));
let g = C.empty(); g.clips = [{ id: 'g1', kind: 'gap', dur: 3 }];
g = C.fillGap(g, 'g1', C.videoClip(A, 1, 5, 6));
ok('a clip dropped in a slot takes the slot length', g.clips.length === 1 && near(C.total(g), 3));
// presets
ok('every easing maps 0 → 0 and 1 → 1', FX.EASES.every((x) => near(x.fn(0), 0, 1e-6) && near(x.fn(1), 1, 1e-6)), FX.EASES.filter((x) => !near(x.fn(0), 0, 1e-6) || !near(x.fn(1), 1, 1e-6)).map((x) => x.id));
ok('every transition has a render path and a preview', FX.TRANSITIONS.every((x) => x.id === 'cut' || ((x.ff || x.expr) && typeof x.preview === 'function')));
ok('every look grades to filters', FX.LOOKS.every((l) => FX.colorFilters(FX.colorMath(FX.grade({ look: l.id }))).length > 0), FX.LOOKS.filter((l) => !FX.colorFilters(FX.colorMath(FX.grade({ look: l.id }))).length).map((l) => l.id));
ok('find by loose name', FX.find(FX.TRANSITIONS, 'cross dissolve')?.id === 'dissolve' && FX.find(FX.LOOKS, 'teal orange')?.id === 'teal-orange');
ok('every motion preset gives keys inside the clip', FX.MOTIONS.every((m) => Object.values(m.fn(2)).every((list) => list.every(([tt]) => tt >= 0 && tt <= 2 + 1e-9))));
for (const [n, list] of Object.entries({ EASES: FX.EASES, LOOKS: FX.LOOKS, TRANSITIONS: FX.TRANSITIONS, TITLE_STYLES: FX.TITLE_STYLES, TITLE_ANIMS: FX.TITLE_ANIMS, LOWER_THIRDS: FX.LOWER_THIRDS, SHAPES: FX.SHAPES, MOTIONS: FX.MOTIONS, RAMPS: FX.RAMPS, EXPORTS: FX.EXPORTS, TEMPLATES: FX.TEMPLATES, EFFECTS: FX.EFFECTS, AUDIO_FX: FX.AUDIO_FX })) ok(`${n}: ids are unique`, new Set(list.map((x) => x.id)).size === list.length);
ok('templates only use presets that exist', FX.TEMPLATES.every((t) => { const b = t.build(); return (!b.look || FX.LOOK[b.look]) && (!b.motion || FX.MOTION[b.motion]) && (b.clips || []).every((c) => !c.trans || FX.TRANS[c.trans.type]) && (b.text || []).every((x) => (!x.style || FX.TSTYLE[x.style]) && (!x.anim || FX.TANIM[x.anim]) && (!x.out || FX.TANIM[x.out]) && (!x.lower || FX.LTHIRD[x.lower])) && FX.FORMATS.some((f) => f.id === t.fmt); }));
ok('lower thirds use animations that exist', FX.LOWER_THIRDS.every((l) => !l.s.anim || FX.TANIM[l.s.anim]));
ok('every template builds', FX.TEMPLATES.every((x) => { const b = x.build(); return b.clips?.length > 0; }));
ok('keyExpr samples an eased curve', /gte\(/.test(FX.keyExpr([{ t: 0, v: 0, ease: 'expoOut' }, { t: 1, v: 1 }])));

// ---------- renders ----------
const run = (g0, name) => { const file = path.join(OUT, name); execFileSync('ffmpeg', [...g0.args.slice(0, -0 || undefined), file], { stdio: ['ignore', 'ignore', 'pipe'] }); return file; };
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
const frameAt = (f, sec, w, h) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(sec), '-i', f, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-'], { maxBuffer: 64e6 });
// frame n starts at n / fps; an accurate -ss keeps the first frame at or after it, so sample just before the start
const codeAt = (f, sec, w, h, rect) => decodeFrameCode(frameAt(f, Math.max(0, sec - 0.5 / 30 - 0.002), w, h), w, h, { channels: 3, ...(rect || {}) });
const durOf = (f) => Number(probe(f).format.duration);
const opts = (o = {}) => ({ presetFilters: V.presetFilters, codecArgs: V.codecArgs, ...o });
const render = (edit, name, o) => { const g0 = FFX.args(edit, info, canvas, opts(o)); try { return { file: run(g0, name), g: g0 }; } catch (err) { console.log(`render ${name} failed:`, String(err.stderr || err).slice(-1500)); return { file: null, g: g0 }; } };

// 1. a dissolve between A 0–2 and B 2–4: 3.5 s; frame codes on both sides
{
  let x = C.empty(); x.clips = [C.videoClip(A, 0, 2, 6), C.videoClip(B, 2, 4, 6)];
  x = C.setTrans(x, x.clips[1].id, 'dissolve', 0.5);
  const { file } = render(x, 'dissolve.mp4');
  ok('dissolve renders', Boolean(file));
  if (file) {
    ok('dissolve length = 3.5 s', near(durOf(file), 3.5, 0.05), durOf(file));
    ok('frame 30 (1.0 s) is A frame 30', codeAt(file, 1.0 + 0.5 / 30, 540, 960) === 30, codeAt(file, 1.0 + 0.5 / 30, 540, 960));
    ok('after the transition: B frame (2 + (2.5 − 1.5)) × 30 = 90 at 2.5 s', codeAt(file, 2.5 + 0.5 / 30, 540, 960) === 90, codeAt(file, 2.5 + 0.5 / 30, 540, 960));
  }
}
// 2. every transition family renders (one short render each, small frame)
{
  const small = { w: 160, h: 284, fps: 30 };
  const failed = [];
  for (const tr of FX.TRANSITIONS.filter((x) => x.id !== 'cut')) {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 1, 6), C.videoClip(B, 0, 1, 6)];
    x = C.setTrans(x, x.clips[1].id, tr.id, 0.4);
    x.seq = small;
    const g0 = FFX.args(x, info, small, opts());
    try { execFileSync('ffmpeg', [...g0.args, '-t', '1.6', path.join(OUT, `tr-${tr.id}.mp4`)], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (err) { failed.push(`${tr.id}: ${String(err.stderr).split('\n').filter(Boolean).slice(-2).join(' ')}`); }
  }
  ok(`all ${FX.TRANSITIONS.length - 1} transitions render`, !failed.length, failed.slice(0, 6));
}
// 3. overlay (PIP with keyframed scale + position + opacity), a still, a title-less color, blend modes, audio mix
{
  let x = C.empty(); x.clips = [C.videoClip(A, 0, 4, 6)];
  x = C.addItem(x, { kind: 'video', src: B, in: 1, out: 3, max: 6, start: 1, scale: 0.4, x: 0.25, y: -0.25 });
  const id = x.lastItem;
  x = C.setKey(x, id, 'opacity', 0, 0, 'linear'); x = C.setKey(x, id, 'opacity', 0.5, 1);
  x = C.setKey(x, id, 'rotate', 0, -20, 'easeOut'); x = C.setKey(x, id, 'rotate', 1, 0);
  x = C.addItem(x, { kind: 'image', src: STILL, start: 2.5, dur: 1, scale: 0.3, x: -0.3, y: 0.35, blend: 'screen' });
  x = C.addItem(x, { kind: 'audio', src: MUSIC, in: 0, out: 3, max: 8, start: 0.5, volume: 0.5 });
  const { file } = render(x, 'overlay.mp4');
  ok('overlay edit renders', Boolean(file));
  if (file) {
    const p = probe(file);
    ok('overlay: 4 s, video + audio', near(durOf(file), 4, 0.06) && p.streams.some((s0) => s0.codec_type === 'audio'), durOf(file));
    ok('main picture still readable under the PIP at 0.5 s (A frame 15)', codeAt(file, 0.5 + 0.5 / 30, 540, 960) === 15, codeAt(file, 0.5 + 0.5 / 30, 540, 960));
    // the PIP: 0.4 × 540 = 216 wide, centered at 0.75 W = 405 px, y center 0.25 H = 240 px → top at 240 − 192 = 48
    const pip = codeAt(file, 2 + 0.5 / 30, 540, 960, { x0: 405 - 108, y0: 48, w: 216, h: 384 });
    ok('the PIP shows B at its source frame (1 s in → B frame 60)', pip === 60, pip);
  }
}
// 4. look + reverse + speed + keyframed scale on the main track, sequence 9:16 from a 16:9 source
{
  let x = C.empty(); x.clips = [C.videoClip(Cc, 0, 2, 4), C.videoClip(A, 0, 2, 6)];
  x = C.patchAny(x, x.clips[0].id, (c) => { c.color = { look: 'teal-orange' }; c.reverse = true; });
  x = C.setKey(x, x.clips[1].id, 'scale', 0, 1, 'expoOut'); x = C.setKey(x, x.clips[1].id, 'scale', 1, 1.3);
  x = C.setSeq(x, { w: 540, h: 960, fps: 30 });
  const { file } = render(x, 'look.mp4');
  ok('look / reverse / scale keys render', Boolean(file));
  if (file) {
    ok('9:16 output', probe(file).streams.find((s0) => s0.codec_type === 'video').width === 540);
    // reversed clip C (25 fps) 0–2: at program 0.5 s → source 1.5 s → C frame 37; C is letterboxed: 540 wide, 304 tall, top at 328
    const rc = codeAt(file, 0.5 + 0.5 / 30, 540, 960, { x0: 0, y0: 328, w: 540, h: 304 });
    ok('reverse: C frame 37 at 0.5 s', rc === 37 || rc === 38, rc);
  }
}
// 5. silent clip + gap + image on the main track, export presets: square crop, gif, wav, under-8MB, stills
{
  let x = C.empty(); x.clips = [C.videoClip(S, 0, 1.5, 4), { id: 'g', kind: 'gap', dur: 0.5 }, { id: 'i', kind: 'image', src: STILL, dur: 1 }];
  x = C.setTrans(x, 'i', 'dip-gold', 0.4);
  const sq = render(x, 'square.mp4', { preset: V.EXPORT_PRESETS.find((p) => p.id === 'square') });
  ok('silent clip + gap + still render to 1080×1080', sq.file && probe(sq.file).streams.find((s0) => s0.codec_type === 'video').width === 1080);
  const gif = render(x, 'cut.gif', { preset: V.EXPORT_PRESETS.find((p) => p.id === 'gif') });
  ok('GIF export', gif.file && fs.statSync(gif.file).size > 1000);
  const wav = render(x, 'cut.wav', { preset: FX.EXPORTS.find((p) => p.id === 'audio-wav') });
  ok('audio-only WAV export', wav.file && probe(wav.file).streams.every((s0) => s0.codec_type === 'audio'));
  const tiny = render(x, 'tiny.mp4', { preset: FX.EXPORTS.find((p) => p.id === 'under8') });
  ok('size-targeted export', tiny.file && fs.statSync(tiny.file).size < 8 * 1048576);
  fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
  const st = FFX.args(x, info, canvas, opts({ stills: true }));
  execFileSync('ffmpeg', [...st.args, path.join(OUT, 'stills', 'f_%04d.png')], { stdio: ['ignore', 'ignore', 'pipe'] });
  ok('stills: one PNG per frame', Math.abs(fs.readdirSync(path.join(OUT, 'stills')).length - Math.round((C.total(x)) * 30)) <= 1, fs.readdirSync(path.join(OUT, 'stills')).length);
}
// 6. in–out range of a rich edit
{
  let x = C.empty(); x.clips = [C.videoClip(A, 0, 3, 6), C.videoClip(B, 0, 3, 6)];
  x = C.setTrans(x, x.clips[1].id, 'push-left', 0.5);
  const { file } = render(x, 'range.mp4', { range: { a: 1, b: 2 } });
  ok('in–out: 1 s long, starts on A frame 30', file && near(durOf(file), 1, 0.06) && codeAt(file, 0.5 / 30, 540, 960) === 30, file && [durOf(file), codeAt(file, 0.5 / 30, 540, 960)]);
}
// 7. every look renders (tiny frames)
{
  const small = { w: 96, h: 160, fps: 10 };
  const failed = [];
  for (const l of FX.LOOKS) {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 0.3, 6)];
    x = C.patchAny(x, x.clips[0].id, (c) => { c.color = { look: l.id }; });
    x.seq = small;
    const g0 = FFX.args(x, info, small, opts());
    try { execFileSync('ffmpeg', [...g0.args, path.join(OUT, `look-${l.id}.mp4`)], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (err) { failed.push(`${l.id}: ${String(err.stderr).split('\n').filter(Boolean).slice(-1)}`); }
  }
  ok(`all ${FX.LOOKS.length} looks render`, !failed.length, failed.slice(0, 5));
}

// 8. every clip effect and every sound effect renders
{
  const small = { w: 96, h: 160, fps: 10 };
  const failed = [];
  for (const f of FX.EFFECTS) {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 0.4, 6)]; x.seq = small;
    x = C.patchAny(x, x.clips[0].id, (c) => { c.fx = [{ id: f.id, amt: 0.7 }, { id: 'mirror-left', amt: 1 }]; });
    const g0 = FFX.args(x, info, small, opts());
    try { execFileSync('ffmpeg', [...g0.args, path.join(OUT, `fx-${f.id}.mp4`)], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (err) { failed.push(`${f.id}: ${String(err.stderr).split('\n').filter(Boolean).slice(-1)}`); }
  }
  ok(`all ${FX.EFFECTS.length} clip effects render (stacked with a branching one)`, !failed.length, failed.slice(0, 5));
  const af = [];
  for (const a of FX.AUDIO_FX) {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 2, 6)]; x.seq = small;
    x = C.patchAny(x, x.clips[0].id, (c) => { c.afx = [a.id]; });
    const g0 = FFX.args(x, info, small, opts());
    const file = path.join(OUT, `afx-${a.id}.mp4`);
    try { execFileSync('ffmpeg', [...g0.args, file], { stdio: ['ignore', 'ignore', 'pipe'] }); if (Math.abs(durOf(file) - 2) > 0.1) af.push(`${a.id}: length ${durOf(file)}`); } catch (err) { af.push(`${a.id}: ${String(err.stderr).split('\n').filter(Boolean).slice(-1)}`); }
  }
  ok(`all ${FX.AUDIO_FX.length} sound effects render and keep the length`, !af.length, af.slice(0, 5));
}

// 9. round 11 (pack11): preview sound twins, WebM duration, LUTs, adjustment layers, ducking, pacing, multicam
{
  const VS = require('../tools/video-sound.js');
  const VP = require('../tools/video-pack.js');
  const WD = require('../webm-duration.js');
  const uncovered = FX.AUDIO_FX.filter((a) => !VS.LIVE[a.id] && !VS.RENDER_ONLY.has(a.id)).map((a) => a.id);
  ok('every sound effect has a live twin in the preview or is named render-only', !uncovered.length, uncovered);
  ok('the live twins cover most sound effects', Object.keys(VS.LIVE).length >= FX.AUDIO_FX.length - 4, Object.keys(VS.LIVE).length);
  ok('preview note names the render-only ones', /pitch-up/.test(VS.previewNote(['pitch-up', 'echo'])) && !VS.previewNote(['echo']));
  ok('Backwards + a reversed clip play forward', VS.plan(['backwards']).reverse && !VS.plan(['backwards', 'backwards']).reverse);
  // a browser-style live WebM (no seek index, no Duration) gets its length written
  const live = path.join(OUT, 'live.webm');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=d=2:s=160x120', '-c:v', 'libvpx', '-b:v', '200k', '-live', '1', '-f', 'webm', live]);
  const wb = new Uint8Array(fs.readFileSync(live));
  const si = wb.findIndex((x, j) => x === 0x11 && wb[j + 1] === 0x4d && wb[j + 2] === 0x9b && wb[j + 3] === 0x74);
  if (si >= 0) { const sz = WD._.readSize(wb, si + 4); const total = 4 + sz.len + sz.size; wb[si] = 0xec; wb.set(WD._.sizeBytes(total - 9, 8), si + 1); }
  fs.writeFileSync(live, wb);
  ok('the live WebM has no duration', WD.read(wb) == null && !(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', live]).toString()) > 0));
  const fixed = path.join(OUT, 'fixed.webm');
  fs.writeFileSync(fixed, WD.fix(wb, 2000));
  ok('WebmDuration writes 2.0 s ffprobe reads', near(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fixed]).toString()), 2, 0.01));
  ok('WebmDuration: an already-right header is left alone', WD.fix(WD.fix(wb, 2000), 2000).length === wb.length + 11);
  // LUTs: identity, a warm grade, an invert
  const cube = (n, f, title) => { const L0 = [`TITLE "${title}"`, `LUT_3D_SIZE ${n}`]; for (let b0 = 0; b0 < n; b0 += 1) for (let g0 = 0; g0 < n; g0 += 1) for (let r0 = 0; r0 < n; r0 += 1) L0.push(f(r0 / (n - 1), g0 / (n - 1), b0 / (n - 1)).map((v) => v.toFixed(6)).join(' ')); return L0.join('\n'); };
  const id = VP.parseCube(cube(17, (r0, g0, b0) => [r0, g0, b0], 'Identity'));
  ok('parseCube reads a 17³ LUT', id.size === 17 && id.title === 'Identity' && id.data.length === 17 ** 3 * 3);
  const fi = VP.fitLut(id);
  ok('identity LUT → identity twin', fi.err < 0.002 && near(fi.m[0], 1, 0.01) && near(fi.m[4], 1, 0.01) && near(fi.o[0], 0, 0.01), fi.err);
  const warm = VP.parseCube(cube(9, (r0, g0, b0) => [Math.min(1, r0 * 1.1 + 0.02), g0, b0 * 0.85], 'Warm'));
  ok('a warm LUT samples warmer', VP.sample(warm, 0.5, 0.5, 0.5)[0] > 0.55 && VP.sample(warm, 0.5, 0.5, 0.5)[2] < 0.45);
  ok('the preview twin of a grade is close (< 1 %)', VP.fitLut(warm).err < 0.01, VP.fitLut(warm).err);
  const sat = VP.parseCube(cube(9, (r0, g0, b0) => { const y = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0; return [r0, g0, b0].map((v) => Math.max(0, Math.min(1, y + (v - y) * 0.3))); }, 'Desat'));
  ok('a desaturating LUT is fitted by the matrix (< 2 %)', VP.fitLut(sat).err < 0.02, VP.fitLut(sat).err);
  let bad = null; try { VP.parseCube('LUT_3D_SIZE 4\n0 0 0'); } catch (err) { bad = err.message; }
  ok('a broken .cube says why', /entries/.test(bad || ''), bad);
  const invPath = path.join(OUT, 'invert lut.cube');
  fs.writeFileSync(invPath, cube(9, (r0, g0, b0) => [1 - r0, 1 - g0, 1 - b0], 'Invert'));
  const meanAt = (f, sec) => { const px = frameAt(f, sec, 54, 96); let m = 0; for (const v of px) m += v; return m / px.length; };
  {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 1, 6), C.videoClip(B, 0, 1, 6)];
    x = C.patchAny(x, x.clips[1].id, (c) => { c.lut = { path: invPath, name: 'Invert', kind: '3d' }; });
    ok('a clip with only a LUT plays and renders as rich', C.isRich(x));
    const plain = render(C.patchAny(x, x.clips[1].id, (c) => { delete c.lut; }), 'nolut.mp4');
    const lut = render(x, 'lut.mp4');
    ok('LUT renders (a path with a space)', Boolean(lut.file));
    if (lut.file && plain.file) ok('the LUT inverts the picture in the render', near(meanAt(lut.file, 1.5), 255 - meanAt(plain.file, 1.5), 12) && near(meanAt(lut.file, 0.5), meanAt(plain.file, 0.5), 6), [meanAt(lut.file, 1.5), meanAt(plain.file, 1.5)]);
    // an adjustment layer 0.5–1.5 s with the invert LUT: everything under it inverts there, not elsewhere
    let y = C.patchAny(x, x.clips[1].id, (c) => { delete c.lut; });
    y = C.addItem(y, { kind: 'adjust', start: 0.5, dur: 1 });
    y = C.patchAny(y, y.lastItem, (c) => { c.lut = { path: invPath, name: 'Invert', kind: '3d' }; });
    ok('an adjustment layer describes itself', C.describeAll(y).some((l) => /adjustment layer/.test(l) && /LUT Invert/.test(l)));
    const adj = render(y, 'adjust.mp4');
    ok('adjustment layer renders', Boolean(adj.file));
    if (adj.file && plain.file) ok('the adjustment layer applies over its range only', near(meanAt(adj.file, 1.0), 255 - meanAt(plain.file, 1.0), 12) && near(meanAt(adj.file, 0.2), meanAt(plain.file, 0.2), 6) && near(meanAt(adj.file, 1.8), meanAt(plain.file, 1.8), 6), [meanAt(adj.file, 0.2), meanAt(adj.file, 1.0), meanAt(plain.file, 1.0)]);
    // with a look (no LUT) and at half strength
    let z = C.patchAny(x, x.clips[1].id, (c) => { delete c.lut; });
    z = C.addItem(z, { kind: 'adjust', start: 0, dur: 2, opacity: 0.5, fadeIn: 0.3, color: { look: 'noir-cine' }, fx: [{ id: FX.EFFECTS[0].id, amt: 0.5 }] });
    ok('an adjustment layer with a look, an effect, opacity and a fade renders', Boolean(render(z, 'adjust-look.mp4').file));
  }
  // speech → ranges, ducking keys
  const rate = 8000; const sig = new Float32Array(rate * 4);
  for (let i = 0; i < sig.length; i += 1) { const t0 = i / rate; const on = (t0 >= 1 && t0 < 2) || (t0 >= 3 && t0 < 3.5); sig[i] = (on ? 0.4 * Math.sin(2 * Math.PI * 220 * t0) : 0) + (Math.random() - 0.5) * 0.004; }
  const sr = VP.speechRanges(sig, rate);
  ok('speech found where the voice talks', sr.length === 2 && near(sr[0][0], 1, 0.06) && near(sr[0][1], 2, 0.06) && near(sr[1][0], 3, 0.06), sr);
  const music = { kind: 'audio', src: MUSIC, in: 0, out: 5, start: 0, volume: 1, speed: 1 };
  const keys = VP.duckKeys(music, [[1, 2], [2.3, 3]]);
  const mk = { ...music, keys: { volume: keys } };
  ok('ducked: low under the voice, full between far parts, no bounce between close ones', near(C.propAt(mk, 'volume', 1.5), 0.25, 0.01) && near(C.propAt(mk, 'volume', 0.2), 1, 0.01) && near(C.propAt(mk, 'volume', 4), 1, 0.01) && C.propAt(mk, 'volume', 2.15) < 0.6, keys);
  {
    let x = C.empty(); x.clips = [C.videoClip(A, 0, 3, 6)];
    x = C.addItem(x, { ...music, out: 3 }); x = C.patchAny(x, x.lastItem, (c) => { c.keys = { volume: VP.duckKeys(c, [[1, 2]]) }; });
    ok('a ducked music bed renders', Boolean(render(x, 'ducked.mp4').file));
  }
  // pacing like the board, beats
  ok('cuts every 1 s', JSON.stringify(VP.vibeCuts({ to: 5, intervals: [1] })) === '[1,2,3,4]', VP.vibeCuts({ to: 5, intervals: [1] }));
  ok('cuts snap to a near beat', VP.vibeCuts({ to: 4, intervals: [1.5], beats: [0.5, 1.4, 2.9, 3.6] })[0] === 1.4, VP.vibeCuts({ to: 4, intervals: [1.5], beats: [0.5, 1.4, 2.9, 3.6] }));
  ok('existing cuts are skipped', !VP.vibeCuts({ to: 5, intervals: [1], have: [2] }).includes(2));
  ok('board clips give their shot lengths', JSON.stringify(VP.boardIntervals([{ vibe: { kind: 'clip', cuts: [1, 3], duration: 4 } }])) === '[1,2,1]');
  ok('stills only: a pace from their motion', VP.boardIntervals([{ vibe: { motion: 0.7 } }])[0] < 1 && VP.boardIntervals([])[0] > 1);
  // multicam
  const angles = [{ src: A, offset: 0 }, { src: B, offset: 2 }];
  const sw = VP.angleSwap({ id: 'c', kind: 'video', src: A, in: 3, out: 4 }, angles, 1, 6);
  ok('an angle swap keeps the moment', sw.src === B && near(sw.in, 5) && near(sw.out, 6) && sw.cam === 1, sw);
  const env = Array.from({ length: 1500 }, () => Math.random());
  const shifted = [...Array(60).fill(0.5), ...env].slice(0, 1500);
  ok('sync by sound finds the offset (1.2 s)', near(VP.offsetByCorrelation(env, shifted, 50, 5).lag, 1.2, 0.03), VP.offsetByCorrelation(env, shifted, 50, 5));
}

console.log(`${fail ? '✖' : '✓'} editor-test: ${pass} passed, ${fail} failed (renders in ${OUT})`);
process.exit(fail ? 1 : 0);
