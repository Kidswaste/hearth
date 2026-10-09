#!/usr/bin/env node
// Writes a short test song (WAV, 16-bit mono 44.1 kHz) with a clear beat for Lab tests: kick on every beat, snare on
// 2 and 4, closed hats on the 8ths, a bass note per bar and a "drop" (louder, brighter) halfway through.
//   node dev/make-test-song.js [out.wav] [bpm] [seconds]      (default /tmp/hearth-test-song.wav 120 16)
// Options for the music analysis tests (dev/music-test.js, dev/checks/music.js):
//   --form        a whole track instead: intro (hats + bass) 8 bars, build 8 (kicks, a rising snare roll, no bass), drop 16,
//                 break 8 (a quiet pad), drop 8, outro 8 (the seconds argument is then ignored)
//   --pickup N    the song starts N beats before the first downbeat (bar 1 is then at N beats + the lead-in)
//   --lead S      seconds of silence before the first sound (default 0)
//   --style S     four (default: kick on every beat) · half (trap-like: kick on 1 and the "and" of 3, fast hats)
//                 · breaks (drum & bass: kick 1 and the "and" of 2, snare 2 and 4, 16th hats)
// require('./make-test-song').song({ bpm, secs, form, pickup, lead, style, sr }) → { samples: Float32Array, sr, truth }
// where truth = { bpm, firstDownbeat, beats, kicks, snares, hats, sections: [{ name, start }] } (seconds).
const fs = require('fs');

function song({ bpm = 120, secs = 16, form = false, pickup = 0, lead = 0, style = 'four', drift = 0, jitter = 0, sr = 44100 } = {}) {
  const beat = 60 / bpm;
  const FORM = [['Intro', 8], ['Build', 8], ['Drop', 16], ['Break', 8], ['Drop', 8], ['Outro', 8]];
  const totalBeats = form ? FORM.reduce((s, x) => s + x[1] * 4, 0) + pickup : Math.ceil(secs / beat);
  const length = form ? lead + totalBeats * beat + 1 : secs;
  const n = Math.round(sr * length);
  const buf = new Float32Array(n);
  let seed = 1; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  const add = (t0, len, f) => { const a = Math.round(t0 * sr); for (let i = 0; i < len * sr && a + i < n; i++) if (a + i >= 0) buf[a + i] += f(i / sr); };
  const truth = { bpm, firstDownbeat: lead + pickup * beat, beats: [], kicks: [], snares: [], hats: [], sections: [] };
  // which part of the form a beat (counted from the first downbeat) is in
  const part = (b) => {
    if (!form) return { name: b * beat >= secs / 2 - pickup * beat ? 'Drop' : 'Main', k: 0 };
    let at = 0;
    for (const [name, bars] of FORM) { if (b < at + bars * 4) return { name, k: (b - at) / (bars * 4) }; at += bars * 4; }
    return { name: 'End', k: 0 };
  };
  // played music: the tempo drifts (drift: how much faster it ends, 0.04 = 4 %) and hits land a little off (jitter ms)
  const starts = [lead]; for (let k = 1; k <= totalBeats + 1; k++) starts.push(starts[k - 1] + beat / (1 + (drift * (k - 1)) / totalBeats));
  const beatAt = (k) => starts[k];
  let js = 7; const jit = () => { js = (js * 48271) % 2147483647; return jitter ? ((js / 2147483647) * 2 - 1) * jitter / 1000 : 0; };
  if (form) { let at = 0; for (const [name, bars] of FORM) { truth.sections.push({ name, start: beatAt(pickup + at) }); at += bars * 4; } }
  truth.firstDownbeat = beatAt(pickup);
  const kick = (t0, g) => { const t = t0 + jit(); add(t, 0.35, (x) => g * 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-x * 30)) * x) * Math.exp(-x * 9)); truth.kicks.push(t); };
  const snare = (t0, g) => { const t = t0 + jit(); add(t, 0.2, (x) => g * 0.45 * noise() * Math.exp(-x * 18)); truth.snares.push(t); };
  // hats: high-passed noise (a first difference), short
  const hat = (t0, g) => { const t = t0 + jit(); let prev = 0; add(t, 0.04, (x) => { const v = noise(); const d = v - prev; prev = v; return g * d * Math.exp(-x * 90); }); truth.hats.push(t); };
  const rawHat = (t, g) => { add(t, 0.04, (x) => g * noise() * Math.exp(-x * 90)); truth.hats.push(t); };
  const bass = (t, f, g, len) => add(t, len, (x) => g * 0.25 * Math.sin(2 * Math.PI * f * x) * Math.min(1, x * 40) * Math.exp(-x * 0.8));
  const pad = (t, len, g) => add(t, len, (x) => g * 0.08 * (Math.sin(2 * Math.PI * 220 * x) + Math.sin(2 * Math.PI * 277.2 * x) + Math.sin(2 * Math.PI * 329.6 * x)) * Math.min(1, x * 4, (len - x) * 4));
  for (let k = 0; k < totalBeats; k++) {
    const b = k - pickup; // beat number from the first downbeat (negative in the pickup)
    const t = beatAt(k);
    if (t >= length - 0.05) break;
    truth.beats.push(t);
    const inBar = ((b % 4) + 4) % 4;
    const p = part(b);
    if (!form) {
      // the classic short test song (unchanged): kick every beat, snare 2 & 4, hats on 8ths, a bass note per bar
      const drop = p.name === 'Drop' ? 1.35 : 1;
      kick(t, drop);
      if (inBar % 2 === 1) snare(t, drop);
      for (const h of [0, 0.5]) (style === 'four' && !pickup && !lead ? rawHat : hat)(t + h * beat, drop > 1 ? 0.2 : 0.12);
      if (inBar === 0) bass(t, [55, 55, 65.4, 49][Math.floor(b / 4) % 4 < 0 ? 0 : Math.floor(b / 4) % 4], drop, beat * 3.5);
      continue;
    }
    const g = { Intro: 0.55, Build: 0.7, Drop: 1.3, Break: 0.35, Outro: 0.6 }[p.name] || 0;
    if (!g) continue;
    const drums = p.name !== 'Intro' && p.name !== 'Break';
    if (drums) {
      if (style === 'half') { if (inBar === 0) kick(t, g); if (inBar === 2) kick(t + beat / 2, g); if (inBar === 2) snare(t, g); }
      else if (style === 'breaks') { if (inBar === 0) kick(t, g); if (inBar === 1) kick(t + beat / 2, g * 0.9); if (inBar % 2 === 1) snare(t, g); }
      else { kick(t, g); if (inBar % 2 === 1 && p.name !== 'Build') snare(t, g); }
      if (p.name === 'Build') { const subs = p.k < 0.5 ? 1 : p.k < 0.75 ? 2 : 4; for (let s = 0; s < subs; s++) snare(t + (s * beat) / subs, 0.25 + 0.75 * p.k); }
    }
    if (p.name !== 'Break') {
      const per = style === 'half' ? 4 : style === 'breaks' ? 4 : 2;
      for (let h = 0; h < per; h++) hat(t + (h * beat) / per, (p.name === 'Drop' ? 0.22 : 0.12));
    }
    if (inBar === 0 && p.name !== 'Break' && p.name !== 'Build') bass(t, [55, 55, 65.4, 49][Math.floor(b / 4) % 4], g, beat * 3.5);
    if (p.name === 'Break' && inBar === 0) pad(t, beat * 4, 1);
  }
  let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) buf[i] = (buf[i] / (peak || 1)) * 0.9;
  return { samples: buf, sr, truth };
}

function wav(samples, sr) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v != null && !v.startsWith('--') ? 2 : 1); return v; };
  const form = args.includes('--form'); if (form) args.splice(args.indexOf('--form'), 1);
  const pickup = Number(flag('--pickup') || 0); const lead = Number(flag('--lead') || 0); const style = flag('--style') || 'four';
  const out = args[0] || '/tmp/hearth-test-song.wav';
  const bpm = Number(args[1] || 120);
  const secs = Number(args[2] || 16);
  const s = song({ bpm, secs, form, pickup, lead, style });
  fs.writeFileSync(out, wav(s.samples, s.sr));
  console.log(`${out}: ${bpm} BPM, ${(s.samples.length / s.sr).toFixed(1)} s${form ? ', full form' : ''}${pickup ? `, pickup ${pickup}` : ''}`);
}
module.exports = { song, wav };
