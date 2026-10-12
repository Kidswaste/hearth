#!/usr/bin/env node
// Lab export model (round 22 "labexport", tools/three-export-core.js): formats, sizes, the export page's pixel ratio
// and GPU cap, sub-frame times, ffmpeg arguments per format (and real ffmpeg runs on generated frames when ffmpeg is
// here), sound, loops on bars, loops found in signatures, presets, contact sheets, the /lab-export words.
//   node dev/labexport-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../tools/three-export-core.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok ${n} ${name}`); };

t('13 formats, aliases', () => {
  assert.strictEqual(C.FORMATS.length, 13);
  assert.strictEqual(C.get('h264').id, 'mp4');
  assert.strictEqual(C.get('4444').id, 'prores');
  assert.strictEqual(C.get('print').id, 'still16');
  assert.strictEqual(C.get('gltf').id, 'glb');
  assert.strictEqual(C.get('nope'), null);
});
t('sizes by name, W×H, multiples, orientation', () => {
  assert.deepStrictEqual(C.size('4k', { w: 1920, h: 1080 }), { w: 3840, h: 2160 });
  assert.deepStrictEqual(C.size('4k', { w: 1080, h: 1920 }), { w: 2160, h: 3840 }); // a portrait frame stays portrait
  assert.deepStrictEqual(C.size('8k-square'), { w: 7680, h: 7680 });
  assert.deepStrictEqual(C.size('2560x1440'), { w: 2560, h: 1440 });
  assert.deepStrictEqual(C.size('2x', { w: 1080, h: 1350 }), { w: 2160, h: 2700 });
  assert.deepStrictEqual(C.size('frame', { w: 1080, h: 1080 }), { w: 1080, h: 1080 });
  assert.strictEqual(C.size('99999x10').w, C.MAX_SIDE);
});
t('the export page: CSS ≤ 1920 a side, the pixel ratio carries the rest, GPU cap', () => {
  assert.deepStrictEqual((({ cssW, cssH, dpr }) => ({ cssW, cssH, dpr }))(C.page(1080, 1920)), { cssW: 1080, cssH: 1920, dpr: 1 });
  assert.deepStrictEqual((({ cssW, cssH, dpr }) => ({ cssW, cssH, dpr }))(C.page(3840, 2160)), { cssW: 1920, cssH: 1080, dpr: 2 });
  const s = C.page(1920, 1080, 2); assert.strictEqual(s.dpr, 2); assert.strictEqual(s.ss, 2);
  const e = C.page(7680, 7680, 2, { cap: 64 }); assert.strictEqual(e.ss, 1); assert.ok(e.capped.length); assert.strictEqual(e.cssW, 1920); assert.strictEqual(e.dpr, 4);
  const k = C.page(3840, 2160, 4, { cap: 64 }); assert.strictEqual(k.ss, 2); // 4K × 4² is over the cap: 2×
});
t('motion blur: sub-frame times across the shutter', () => {
  assert.deepStrictEqual(C.subTimes(1, 30, 1), [1]);
  const ts = C.subTimes(1, 30, 4, 0.5);
  assert.strictEqual(ts.length, 4); assert.strictEqual(ts[0], 1); assert.ok(ts[3] < 1 + 0.5 / 30);
});
t('ffmpeg arguments per format', () => {
  const base = { F: 30, n: 30, input: '/x/f_%05d.png', w: 1920, h: 1080, quality: 'high' };
  const mp4 = C.args({ ...base, format: 'mp4' }).args;
  assert.ok(mp4.includes('libx264') && mp4.includes('yuv420p') && mp4.at(-1) === 'OUTPUT');
  assert.ok(C.args({ ...base, format: 'hevc' }).args.includes('yuv420p10le'));
  const pr = C.args({ ...base, format: 'prores' }).args; assert.ok(pr.includes('prores_ks') && pr.includes('yuva444p10le'));
  assert.ok(C.args({ ...base, format: 'webm' }).args.includes('yuva420p'));
  assert.ok(C.args({ ...base, format: 'gif', loop: { L: 20, X: 4 } }).args.join(' ').includes('palettegen'));
  const odd = C.args({ ...base, format: 'mp4', w: 1081 }); assert.ok(odd.args.join(' ').includes('crop=trunc(iw/2)*2') && odd.note);
  assert.throws(() => C.args({ ...base, format: 'prores', encoders: ['libx264'] }), /ProRes/);
  assert.ok(C.args({ ...base, format: 'hevc', encoders: ['hevc_videotoolbox'] }).args.includes('hevc_videotoolbox'));
  const lp = C.args({ ...base, format: 'loop', loop: { L: 24, X: 6 } }); assert.ok(lp.args.join(' ').includes('xfade') && lp.frames === 24);
});
t('sound: the plan becomes inputs and one [aout] mix', () => {
  const a = C.audio([{ src: '/s.mp3', at: 0, a: 1, len: 2, volume: 1 }, { src: '/v.wav', at: 0.5, a: 0, len: 1, volume: 0.5, voice: true }]);
  assert.deepStrictEqual(a.inputs, ['/s.mp3', '/v.wav']);
  assert.ok(a.filter.endsWith('[aout]') && a.filter.includes('amix=inputs=2'));
  const args = C.args({ format: 'mp4', F: 30, n: 30, input: 'i', w: 2, h: 2, audio: a }).args;
  assert.ok(args.includes('[aout]') && args.includes('aac'));
  assert.ok(!C.args({ format: 'gif', F: 30, n: 30, input: 'i', w: 2, h: 2, audio: a, loop: { L: 30, X: 0 } }).args.includes('[aout]'));
});
t('loops on bars', () => {
  const l = C.loopLen({ bars: 2, bpm: 120, bpb: 4, F: 30 });
  assert.strictEqual(l.L, 120); assert.strictEqual(l.X, 8); // half a beat (0.25 s) → 8 frames
  assert.strictEqual(C.loopLen({ secs: 1.2, F: 25, fade: 0.2 }).X, 5);
  assert.strictEqual(C.loopLen({ secs: 1, F: 30, fade: 0 }).X, 0);
});
t('loops found in the frames', () => {
  const sig = (k) => Array.from({ length: 256 }, (_, i) => Math.round(128 + 100 * Math.sin((i / 256 + k / 17) * Math.PI * 2)));
  const sigs = Array.from({ length: 60 }, (_, i) => sig(i % 17));
  const f = C.findLoop(sigs, { min: 8 });
  assert.strictEqual(f.P, 17); assert.ok(f.natural);
  const noise = Array.from({ length: 40 }, (_, i) => Array.from({ length: 256 }, (_, j) => (i * 37 + j * 11) % 255));
  assert.ok(!C.findLoop(noise, { min: 8 }).natural);
});
t('speed, time left', () => { assert.strictEqual(C.speed(30, 10000), 3); assert.strictEqual(C.eta(10, 30, 5000), 10); assert.strictEqual(C.fmtSecs(125), '2 min'); });
t('presets: written, read back by id, by name, by order', () => {
  const p = C.preset({ scene: 'S', layers: [{ id: 'main', name: 'Main', values: { speed: 2 } }, { id: 'l2', name: 'Glow', values: { amount: 0.4 } }] });
  assert.strictEqual(p.hearth, 'slider-preset');
  assert.deepStrictEqual(C.readPreset(p, [{ id: 'main', name: 'x' }, { id: 'zz', name: 'Glow' }]), [{ layer: 'main', values: { speed: 2 } }, { layer: 'zz', values: { amount: 0.4 } }]);
  assert.throws(() => C.readPreset({ x: 1 }, []), /preset/);
});
t('contact sheet grid', () => { const s = C.sheet(12, 1920, 1080); assert.strictEqual(s.cols * s.rows >= 12, true); assert.ok(s.tw * s.cols <= 2400); });
t('/lab-export words', () => {
  const o = C.parse('mp4 4k ss2 60fps blur16 best 10s seq', { w: 1920, h: 1080 });
  assert.deepStrictEqual({ f: o.format, w: o.size.w, ss: o.ss, fps: o.fps, blur: o.blur, q: o.quality, s: o.secs, src: o.source }, { f: 'mp4', w: 3840, ss: 2, fps: 60, blur: 16, q: 'best', s: 10, src: 'seq' });
  const g = C.parse('gif 2bars detect opaque mute at=3', { w: 1080, h: 1080 });
  assert.deepStrictEqual([g.format, g.bars, g.detect, g.alpha, g.sound, g.at], ['gif', 2, true, false, false, 3]);
});

// real ffmpeg runs on generated RGBA frames (alpha travels, loops cross-fade, GIF loops forever)
let ff = null; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ff = 'ffmpeg'; } catch { /* none */ }
if (ff) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labexport-'));
  execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=25:d=1.6,format=rgba,colorchannelmixer=aa=0.5', path.join(dir, 'f_%05d.png')]);
  const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-print_format', 'json', f]).toString()).streams[0];
  const run = (format, extra = {}) => { const a = C.args({ format, F: 25, n: 40, input: path.join(dir, 'f_%05d.png'), w: 160, h: 90, quality: 'draft', ...extra }); const out = path.join(dir, `o_${format}.${C.get(format).ext}`); execFileSync(ff, a.args.map((x) => (x === 'OUTPUT' ? out : x)).concat([]), { stdio: 'ignore' }); return probe(out); };
  t('ffmpeg: ProRes 4444 keeps alpha', () => { const s = run('prores'); assert.match(s.pix_fmt, /yuva444/); assert.strictEqual(Number(s.nb_read_frames), 40); });
  t('ffmpeg: WebM VP9 keeps alpha', () => { const s = run('webm'); assert.strictEqual(s.codec_name, 'vp9'); assert.strictEqual(s.tags?.alpha_mode || s.tags?.ALPHA_MODE, '1'); });
  t('ffmpeg: MP4 loop is L frames (the tail faded into the head)', () => { const s = run('loop', { loop: { L: 30, X: 8 } }); assert.strictEqual(Number(s.nb_read_frames), 30); });
  t('ffmpeg: the loop has no seam (last → first frame changes like any two frames in a row)', () => {
    const out = path.join(dir, 'o_loop.mp4');
    const raw = execFileSync(ff, ['-v', 'error', '-i', out, '-vf', 'scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const N = raw.length / (32 * 18); const fr = (i) => raw.subarray(i * 576, (i + 1) * 576);
    const d = (a, b) => { let s = 0; for (let i = 0; i < 576; i++) s += Math.abs(a[i] - b[i]); return s / 576; };
    const steps = []; for (let i = 1; i < N; i++) steps.push(d(fr(i - 1), fr(i)));
    const wrap = d(fr(N - 1), fr(0)); const typical = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
    assert.ok(wrap <= typical * 1.6 + 1, `wrap ${wrap.toFixed(2)} vs typical ${typical.toFixed(2)}`);
  });
  t('ffmpeg: GIF loop, L frames', () => { const s = run('gif', { loop: { L: 30, X: 6 }, gifFps: 25 }); assert.strictEqual(s.codec_name, 'gif'); assert.strictEqual(Number(s.nb_read_frames), 30); });
  t('ffmpeg: HEVC 10-bit', () => { const s = run('hevc'); assert.strictEqual(s.codec_name, 'hevc'); assert.match(s.pix_fmt, /10/); });
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log('# no ffmpeg here: the encoder runs were skipped');
console.log(`\n${n} passed`);
