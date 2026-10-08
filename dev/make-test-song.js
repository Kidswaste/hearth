#!/usr/bin/env node
// Writes a short test song (WAV, 16-bit mono 44.1 kHz) with a clear beat for Lab tests: kick on every beat, snare on
// 2 and 4, closed hats on the 8ths, a bass note per bar and a "drop" (louder, brighter) halfway through.
//   node dev/make-test-song.js [out.wav] [bpm] [seconds]      (default /tmp/hearth-test-song.wav 120 16)
const fs = require('fs');
const out = process.argv[2] || '/tmp/hearth-test-song.wav';
const bpm = Number(process.argv[3] || 120);
const secs = Number(process.argv[4] || 16);
const SR = 44100;
const n = Math.round(SR * secs);
const buf = new Float32Array(n);
const beat = 60 / bpm;
let seed = 1; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
const add = (t0, len, f) => { const a = Math.round(t0 * SR); for (let i = 0; i < len * SR && a + i < n; i++) buf[a + i] += f(i / SR); };
for (let b = 0; b * beat < secs; b++) {
  const t = b * beat; const drop = t >= secs / 2 ? 1.35 : 1;
  add(t, 0.35, (x) => drop * 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9)); // kick
  if (b % 2 === 1) add(t, 0.2, (x) => drop * 0.45 * noise() * Math.exp(-x * 18)); // snare on 2 and 4
  for (const h of [0, 0.5]) add(t + h * beat, 0.04, (x) => (drop > 1 ? 0.2 : 0.12) * noise() * Math.exp(-x * 90)); // hats
  if (b % 4 === 0) { const f = [55, 55, 65.4, 49][(b / 4) % 4]; add(t, beat * 3.5, (x) => drop * 0.25 * Math.sin(2 * Math.PI * f * x) * Math.min(1, x * 40) * Math.exp(-x * 0.8)); }
}
let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) data.writeInt16LE(Math.round((buf[i] / peak) * 0.9 * 32767), i * 2);
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([h, data]));
console.log(`${out}: ${bpm} BPM, ${secs} s`);
