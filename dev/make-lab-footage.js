#!/usr/bin/env node
// Test footage for the Lab footage checks (dev/checks/labframes*.js): the editor's frame-coded clips
// (dev/make-editor-videos.js: every frame carries its number as a 12-bit band code + big text), plus
//   frames_2997.mp4   29.97 fps with the same code (non-integer rate)
//   ref_cuts.mp4      a "reference" with known shots: 1.0, 0.5, 1.5, 0.5, 1.0 s of different colors (pacing reads)
//   node dev/make-lab-footage.js [folder]      (default /tmp/labframes-media)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/tmp/labframes-media';
fs.mkdirSync(OUT, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'make-editor-videos.js'), OUT], { stdio: 'ignore' });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const code = (w, h) => `geq=lum='if(lt(Y,${Math.round(h * 0.12)}),if(eq(mod(floor(N/pow(2,floor(X*12/${w}))),2),1),235,16),lum(X,Y))':cb='if(lt(Y,${Math.round(h * 0.12)}),128,cb(X,Y))':cr='if(lt(Y,${Math.round(h * 0.12)}),128,cr(X,Y))'`;
ff(['-f', 'lavfi', '-i', `testsrc2=s=480x480:r=30000/1001:d=4,format=yuv420p,${code(480, 480)}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-bf', '0', '-an', path.join(OUT, 'frames_2997.mp4')]);
const shots = [['red', 1], ['blue', 0.5], ['yellow', 1.5], ['green', 0.5], ['white', 1]];
const inputs = shots.flatMap(([c, d]) => ['-f', 'lavfi', '-i', `color=c=${c}:s=320x240:r=30:d=${d}`]);
ff([...inputs, '-filter_complex', `${shots.map((_, i) => `[${i}:v]`).join('')}concat=n=${shots.length}:v=1:a=0,format=yuv420p[v]`, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(OUT, 'ref_cuts.mp4')]);
for (const f of fs.readdirSync(OUT).filter((x) => /\.(mp4|wav|png)$/.test(x))) console.log(path.join(OUT, f));
