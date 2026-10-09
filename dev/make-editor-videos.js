#!/usr/bin/env node
// Test media for the video editor checks (dev/editor-test.js, dev/checks/editor*.js): clips whose every frame
// carries its own number, big (drawtext) and as a machine-readable code: 12 vertical bands across the top 12 % of
// the frame, band k white when bit k of the frame number is set (dev/editor-frames.js reads it back from pixels).
//   node dev/make-editor-videos.js [folder]      (default /tmp/hearth-editor-videos)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/tmp/hearth-editor-videos';
fs.mkdirSync(OUT, { recursive: true });
const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'].find((f) => fs.existsSync(f));
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// the frame-number code: geq draws the top bands from N (the frame index)
const code = (w, h) => `geq=lum='if(lt(Y,${Math.round(h * 0.12)}),if(eq(mod(floor(N/pow(2,floor(X*12/${w}))),2),1),235,16),lum(X,Y))':cb='if(lt(Y,${Math.round(h * 0.12)}),128,cb(X,Y))':cr='if(lt(Y,${Math.round(h * 0.12)}),128,cr(X,Y))'`;
const label = (tag) => (FONT ? `,drawtext=fontfile='${FONT}':text='${tag} %{frame_num}':fontsize=h/9:fontcolor=white:borderw=4:bordercolor=black:x=(w-tw)/2:y=h*0.42` : '');
const beat = (d) => `aevalsrc='0.6*sin(2*PI*60*t)*exp(-12*mod(t\\,0.5))+0.15*sin(2*PI*880*t)*exp(-30*mod(t+0.25\\,0.5))':s=48000:d=${d}`;

function clip(name, { w, h, fps, d, src = 'testsrc2', tag, audio = true, hue = 0 }) {
  const v = `${src}=s=${w}x${h}:r=${fps}:d=${d}${hue ? `,hue=h=${hue}` : ''},format=yuv420p${label(tag)},${code(w, h)}`;
  const args = ['-f', 'lavfi', '-i', v];
  if (audio) args.push('-f', 'lavfi', '-i', beat(d));
  args.push('-t', String(d), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-bf', '0');
  if (audio) args.push('-c:a', 'aac', '-shortest'); else args.push('-an');
  args.push(path.join(OUT, name));
  ff(args);
}
clip('frames_a_30.mp4', { w: 540, h: 960, fps: 30, d: 6, tag: 'A' });
clip('frames_b_30.mp4', { w: 540, h: 960, fps: 30, d: 6, tag: 'B', hue: 120 });
clip('frames_c_25.mp4', { w: 960, h: 540, fps: 25, d: 4, tag: 'C', src: 'testsrc' });
clip('frames_silent_24.mp4', { w: 640, h: 640, fps: 24, d: 4, tag: 'S', audio: false, hue: 240 });
// a still and a music bed
ff(['-f', 'lavfi', '-i', 'testsrc2=s=800x600:r=1:d=1', '-frames:v', '1', path.join(OUT, 'still.png')]);
ff(['-f', 'lavfi', '-i', beat(8), '-c:a', 'pcm_s16le', path.join(OUT, 'music.wav')]);
for (const f of fs.readdirSync(OUT)) console.log(path.join(OUT, f));
