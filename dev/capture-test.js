#!/usr/bin/env node
// Frame reader accuracy (framereader.js) without the app: makes test videos with the frame number burned in twice
// (as text for people, as an 11-bit bar code the test reads back), then asks for frames by number, by time and by
// timecode and checks that exactly that frame comes out. Also compares against ffmpeg's own decode-everything
// extraction (select=eq(n,N)) pixel for pixel, and checks every-N, scenes, motion, sheets and the timecode helpers.
//   node dev/capture-test.js            (needs ffmpeg + ffprobe; makes its videos in a temp folder)
//   node dev/capture-test.js --keep     (keeps the folder; prints it)
//   node dev/capture-test.js --make DIR  (only makes the test videos in DIR, for dev/checks/capture-frames.js)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FR = require('../framereader');

const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
const T = FR.tools();
if (!T.ffmpeg) { console.log('ffmpeg not found: skipped'); process.exit(0); }
const makeOnly = process.argv.includes('--make') ? process.argv[process.argv.indexOf('--make') + 1] : null;
const dir = makeOnly ? (fs.mkdirSync(makeOnly, { recursive: true }), makeOnly) : fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-frames-test-'));
const BITS = 11;
// bar code: bit k of the frame number = a white 22×22 square at x = 10 + 26k, y = 200 (black when 0)
function barcode() {
  const boxes = [];
  for (let k = 0; k < BITS; k += 1) boxes.push(`drawbox=x=${10 + k * 26}:y=200:w=22:h=22:color=white:t=fill:enable='gte(mod(floor(n/${2 ** k})\\,2)\\,1)'`);
  return boxes.join(',');
}
// make(name, { rate, seconds, codec, ext, vfr, scenes: [lavfi sources joined as shots], move: a big moving box })
function make(name, { rate = '30', seconds = 6, codec = ['-c:v', 'libx264', '-g', '48', '-bf', '2', '-pix_fmt', 'yuv420p'], ext = 'mp4', scenes = null, move = false, vfr = false } = {}) {
  const out = path.join(dir, `${name}.${ext}`);
  let vf = `drawtext=text='%{frame_num}':fontsize=56:fontcolor=white:x=10:y=10,${barcode()}`;
  // VFR: drop frames unevenly (keep frames where n mod 5 != 3), then keep the original timestamps
  if (vfr) vf += ",select='not(eq(mod(n\\,5)\\,3))'";
  let input;
  if (scenes) {
    // shots of different sources joined end to end: hard cuts at every shot boundary
    const parts = scenes.map((src, i) => `${src}${src.includes('=') ? ':' : '='}size=320x240:rate=${rate}:duration=${seconds / scenes.length},format=yuv420p,setsar=1[s${i}]`);
    input = ['-filter_complex', `${parts.join(';')};${scenes.map((_, i) => `[s${i}]`).join('')}concat=n=${scenes.length}:v=1:a=0,${vf}[v]`, '-map', '[v]'];
  } else {
    // a big white box sliding across (overlay moves per frame; drawbox would stay put)
    const bg = move ? `color=c=black:size=320x240:rate=${rate}:duration=${seconds}[bg];color=c=white:size=80x150:rate=${rate}[fg];[bg][fg]overlay=x='mod(t*400\\,240)':y=40:shortest=1[out0]`
      : `color=c=black:size=320x240:rate=${rate}:duration=${seconds}`;
    input = ['-f', 'lavfi', '-i', bg, '-vf', vf];
  }
  execFileSync(T.ffmpeg, ['-v', 'error', '-y', ...input, ...(vfr ? ['-fps_mode', 'vfr'] : []), ...codec, out]);
  return out;
}
// The number in the bar code of a picture file (decoded to 320 px wide gray).
function readNumber(png) {
  const raw = execFileSync(T.ffmpeg, ['-v', 'error', '-i', png, '-vf', 'scale=320:240', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  let n = 0;
  for (let k = 0; k < BITS; k += 1) { const v = raw[(200 + 11) * 320 + 10 + k * 26 + 11]; if (v > 128) n += 2 ** k; }
  return n;
}
const rawOf = (file, filter) => execFileSync(T.ffmpeg, ['-v', 'error', '-i', file, ...(filter ? ['-vf', filter] : []), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);

(async () => {
  const videos = {
    cfr2997: make('cfr2997', { rate: '30000/1001', seconds: 8 }),
    cfr25: make('cfr25', { rate: '25', seconds: 6 }),
    cfr60: make('cfr60', { rate: '60', seconds: 5 }),
    vfr: make('vfr', { rate: '30', seconds: 6, vfr: true }),
    webm: make('webm', { rate: '30', seconds: 4, ext: 'webm', codec: ['-c:v', 'libvpx', '-b:v', '1M', '-g', '60', '-deadline', 'realtime'] }),
    cuts: make('cuts', { rate: '30', seconds: 8, scenes: ['color=c=red', 'testsrc2', 'color=c=0x2040ff', 'smptebars'] }),
    moving: make('moving', { rate: '30', seconds: 4, move: true }),
  };
  if (makeOnly) { console.log(JSON.stringify(videos)); process.exit(0); }
  const info = await FR.probe(videos.cfr2997);
  check(Math.abs(info.fps - 29.97) < 0.01 && info.rate === '30000/1001' && info.w === 320, `probe: ${info.fps} fps (${info.rate}), ${info.w}×${info.h}, ${info.frames} frames`);
  const vinfo = await FR.probe(videos.vfr);
  const vt = await FR.frameTimes(videos.vfr);
  check(vt.length === 144, `VFR: ${vt.length} frame times counted from packets (expect 144 of 180)`);
  for (const [name, file] of Object.entries(videos)) {
    if (name === 'cuts') continue;
    const times = await FR.frameTimes(file);
    const total = times.length;
    const picks = [0, 1, 2, 3, 47, 48, 49, Math.floor(total / 2), total - 2, total - 1, -1];
    let ok = 0; const bad = [];
    for (const n of picks) {
      const r = await FR.frameAt(file, { frame: n }, { dir });
      const want = n < 0 ? total + n : n;
      // the burned number is the SOURCE frame number: for the VFR file frames were dropped, so map through
      const burned = readNumber(r.path);
      const expect = name === 'vfr' ? [...Array(180).keys()].filter((i) => i % 5 !== 3)[want] : want;
      if (burned === expect && r.frame === want) ok += 1; else bad.push(`${n}→${burned}≠${expect}`);
    }
    check(ok === picks.length, `${name}: frame by number exact ${ok}/${picks.length}${bad.length ? ` (${bad.join(', ')})` : ''}`);
    // by time: the frame on screen at t is floor(t * fps) for CFR (times start at 0)
    if (name !== 'vfr') {
      const fps = (await FR.probe(file)).fps;
      let okT = 0; const badT = [];
      for (const t of [0, 0.5, 1, 1.234, 2.0, total / fps - 0.01]) {
        const r = await FR.frameAt(file, { time: t }, { dir });
        const expect = Math.min(total - 1, Math.floor(t * fps + 1e-6));
        const got = readNumber(r.path);
        if (got === expect) okT += 1; else badT.push(`${t}s→${got}≠${expect}`);
      }
      check(okT === 6, `${name}: frame by time exact ${okT}/6${badT.length ? ` (${badT.join(', ')})` : ''}`);
    }
  }
  // VFR by time: the frame on screen at t = last frame time ≤ t
  {
    let ok = 0;
    for (const t of [0.1, 0.11, 1.0, 2.5, 3.3]) {
      const r = await FR.frameAt(videos.vfr, { time: t }, { dir });
      const idx = vt.filter((x) => x - vt[0] <= t + 1e-6).length - 1;
      if (r.frame === idx && readNumber(r.path) === [...Array(180).keys()].filter((i) => i % 5 !== 3)[idx]) ok += 1;
    }
    check(ok === 5, `vfr: frame by time exact ${ok}/5`);
  }
  // timecodes in, timecodes out (29.97 nominal 30)
  const byTc = await FR.frameAt(videos.cfr2997, { tc: '00:00:02:15' }, { dir });
  check(byTc.frame === 75 && readNumber(byTc.path) === 75 && byTc.tc === '00:00:02:15', `timecode 00:00:02:15 → frame ${byTc.frame} (${byTc.tc})`);
  check(FR.tc(61.5, 25) === '00:01:01:12' && FR.tc(1.5, 30, 'ms') === '0:01.500' && FR.parseTime('f120', 60) === 2 && FR.parseTime('1:02.5') === 62.5 && FR.parseTime('00:00:01:12', 24) === 1.5 && FR.parseTime('00:00:01:00', 30000 / 1001) === 30 / (30000 / 1001) && FR.parseTime('250ms') === 0.25, 'tc / parseTime formats');
  // pixel-exact against ffmpeg's own decode-everything extraction
  {
    let same = 0;
    for (const n of [5, 77, 150, 200]) {
      const r = await FR.frameAt(videos.cfr2997, { frame: n }, { dir, format: 'png' });
      const a = rawOf(r.path); const b = rawOf(videos.cfr2997, `select=eq(n\\,${n})`);
      if (Buffer.compare(a, b) === 0) same += 1;
    }
    check(same === 4, `pixel-identical to ffmpeg select=eq(n,N): ${same}/4`);
  }
  // many frames: one pass vs seeks give the same numbers
  {
    const total = (await FR.frameTimes(videos.cfr25)).length;
    const list = Array.from({ length: 30 }, (_, i) => i * 5).filter((n) => n < total);
    const rs = await FR.frames(videos.cfr25, { frames: list }, { dir, width: 160, format: 'jpg' });
    const ok = rs.filter((r, i) => r.path && readNumber(r.path) === list[i]).length;
    check(ok === list.length, `30 frames in one pass, scaled to 160 px jpg: ${ok}/${list.length} exact`);
    const ev = await FR.every(videos.cfr60, { every: 30, max: 50 }, { dir });
    check(ev.length === 10 && ev.every((r, i) => r.frame === i * 30 && readNumber(r.path) === i * 30), `every 30 frames: ${ev.length} frames, all exact`);
    const sp = await FR.spread(videos.cfr60, { count: 6 }, { dir });
    check(sp.length === 6 && sp[0].frame === 0 && sp[5].frame === 299, `spread 6: frames ${sp.map((x) => x.frame).join(',')}`);
  }
  // scenes: the cuts video changes hue every 2 s → cuts near 2, 4, 6 s
  {
    const s = await FR.scenes(videos.cuts, { threshold: 0.2 }, { dir, width: 160 });
    const times = s.cuts.map((c) => c.time);
    const near = [2, 4, 6].every((t) => times.some((x) => Math.abs(x - t) < 0.05));
    check(near && s.cuts.every((c) => c.path && fs.existsSync(c.path)), `scenes: ${s.cuts.length} shots at ${times.map((t) => t.toFixed(2)).join(', ')}`);
    const m = await FR.motion(videos.moving, { buckets: 16 });
    check(m.curve.length === 16 && m.average > 0 && m.peaks.length > 0, `motion: avg ${m.average}, peaks at ${m.peaks.map((p) => p.time).join(', ')}`);
    const still = await FR.motion(videos.cfr25, { buckets: 8 });
    check(still.average < m.average, `motion: the static test video (${still.average}) is calmer than the moving one (${m.average})`);
  }
  // a tiled sheet
  {
    const sh = await FR.sheet(videos.cfr25, { cols: 3, rows: 2, width: 600 }, { dir });
    const p = await FR.probe(sh.path).catch(() => null);
    check(fs.existsSync(sh.path) && sh.frames.length === 6 && p && p.w > 500, `sheet 3×2: ${p?.w}×${p?.h}, frames ${sh.frames.map((f) => f.frame).join(',')}`);
  }
  // webm without duration → remux + mp4
  {
    const mp4 = path.join(dir, 'conv.mp4');
    await FR.convert(videos.webm, mp4, { mp4: true });
    const p = await FR.probe(mp4);
    check(p.codec === 'h264' && p.frames === 120, `convert webm → mp4: ${p.codec}, ${p.frames} frames`);
  }
  // errors
  let err = null; try { await FR.frameAt(path.join(dir, 'nope.mp4'), { frame: 1 }); } catch (e) { err = e; }
  check(err && /not found/i.test(err.message), 'missing file: clear error');
  if (process.argv.includes('--keep')) console.log(`kept: ${dir}`); else fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
