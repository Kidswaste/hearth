/* (round 69, stems69) 📤 Send to my DAW: the thinking, with no DOM and no runtime (Node tests require it:
   dev/stems69-test.js). A song from the Sound desk (a Live set song's clip pads, or the Arrange song's lanes) goes out as
   a folder a DAW opens without fuss: "<song> — stems <date>/" holding 48 kHz 24-bit WAVs that ALL start at bar 1 and ALL
   have the same length (whole bars at the song's tempo, silence after a part ends), so dropping them in Ableton / FL /
   Logic at bar 1 lines them up to the sample; the MIDI of the parts Hearth has notes for (same number and name as their
   WAV, bar 1 = tick 0, the song's tempo); copies of the presets; a README.txt saying what each file is.
   Here: names safe on Windows and the Mac, tempo / key in them, the common length, padding, the 24-bit WAV header and
   samples (written in pieces by main, so a long song never sits in memory twice), the "never clip" gain shared by every
   file (so the stems still add up to the mix), the key guessed from the notes played, a pad's notes on the song's
   grid, and the README. tools/dawsend.js is the panel; dawsendmain.js writes the folder. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.DawSendCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const RATE = 48000, BITS = 24, CEILING_DB = -1, MAX_SECONDS = 30 * 60;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- names (Windows + Mac safe: no <>:"/\|?* or control characters, no trailing dot / space, no CON / PRN …) ----------
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  function clean(name, max = 60, fallback = 'Song') {
    let s = String(name ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.slice(0, max).replace(/[. ]+$/g, '').trim();
    if (!s) s = fallback;
    if (RESERVED.test(s.split('.')[0])) s = '_' + s;
    return s;
  }
  const bpmText = bpm => { const b = Math.round(Number(bpm) * 100) / 100; return Number.isInteger(b) ? String(b) : String(b).replace(/0+$/, ''); };
  const pad2 = n => String(n).padStart(2, '0');
  const stamp = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  /** "<song> — stems 2026-10-26" (main adds " 2", " 3"… when that folder is already there: nothing is ever written over). */
  const folderName = (song, date = new Date()) => `${clean(song, 60)} — stems ${stamp(date)}`;
  /** "01 Belleville 4 bars - 124 BPM - A minor.wav": the number keeps the DAW's order, the tempo / key travel with the file. */
  function fileName({ n, name, bpm, key = '', ext = 'wav' }) {
    const k = clean(key, 16, ''), tail = ` - ${bpmText(bpm)} BPM${k ? ' - ' + k : ''}`;
    return `${pad2(n)} ${clean(name, 60, 'Part')}${tail}.${ext}`;
  }
  const presetName = (instrument, label, ext) => `${clean(instrument, 20, 'Synth')} - ${clean(label, 60, 'Preset')}${ext}`;

  // ---------- the common length: whole bars at the song's tempo, every file the same number of samples ----------
  const barFrames = (bpm, beats = 4, rate = RATE) => beats * 60 / bpm * rate;
  /** frames: each part's own length (samples) → { bars, total, seconds }: total = the longest part, rounded UP to whole bars
   *  (rounded to a sample once, so every file gets exactly the same count). */
  function plan({ bpm, beats = 4, frames = [], rate = RATE }) {
    if (!(bpm >= 20 && bpm <= 400)) throw Error('The song needs a tempo first.');
    const bf = barFrames(bpm, beats, rate), most = Math.max(1, ...frames.map(n => Math.max(0, Number(n) || 0)));
    const bars = Math.max(1, Math.ceil((most - 0.5) / bf - 1e-9)), total = Math.round(bars * bf); // a part of N bars rounded to a sample (≤ ½ sample over) is still N bars
    if (total / rate > MAX_SECONDS) throw Error(`That's over ${MAX_SECONDS / 60} minutes: too long to send in one go.`);
    return { bars, total, seconds: total / rate, barFrames: bf };
  }
  /** A part on bar 1: stereo (mono doubled), exactly `total` samples: cut after, silence padded after. */
  function fit(channels, total, gain = 1) {
    const src = channels.length === 1 ? [channels[0], channels[0]] : channels.slice(0, 2);
    return src.map(ch => { const o = new Float32Array(total), n = Math.min(total, ch.length); if (gain === 1) o.set(ch.subarray(0, n)); else for (let i = 0; i < n; i++) o[i] = ch[i] * gain; return o; });
  }
  function peakOf(channels) { let p = 0; for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > p) p = v; } return p; }
  /** Every file is turned down by the same amount only when the mix would go over −1 dBFS (levels are as heard otherwise),
   *  so the stems still add up to the mix. → { gain, db } */
  function safeGain(mixPeak, ceilingDb = CEILING_DB) {
    const c = 10 ** (ceilingDb / 20); if (!(mixPeak > c)) return { gain: 1, db: 0 };
    const gain = c / mixPeak; return { gain, db: 20 * Math.log10(gain) };
  }
  function sum(parts, total) { const m = [new Float32Array(total), new Float32Array(total)]; for (const p of parts) for (let c = 0; c < 2; c++) { const s = p[c], d = m[c]; for (let i = 0; i < total; i++) d[i] += s[i]; } return m; }

  // ---------- 24-bit PCM WAV: the header for the whole file, then the samples in pieces ----------
  function wavHeader({ frames, channels = 2, rate = RATE, bits = BITS }) {
    const bytes = new Uint8Array(44), v = new DataView(bytes.buffer), size = frames * channels * bits / 8;
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); v.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * channels * bits / 8, true); v.setUint16(32, channels * bits / 8, true); v.setUint16(34, bits, true);
    str(36, 'data'); v.setUint32(40, size, true);
    return bytes;
  }
  const dataBytes = (frames, channels = 2) => frames * channels * 3;
  /** Samples [from, to) of the channels, interleaved little-endian 24-bit (×gain, rounded, clipped at full scale). */
  function pcm24(channels, from, to, gain = 1) {
    const n = Math.max(0, to - from), c = channels.length, out = new Uint8Array(n * c * 3);
    let o = 0;
    for (let i = from; i < to; i++) for (let k = 0; k < c; k++) {
      let s = Math.round((channels[k][i] || 0) * gain * 8388608); s = s > 8388607 ? 8388607 : s < -8388608 ? -8388608 : s;
      out[o++] = s & 255; out[o++] = (s >> 8) & 255; out[o++] = (s >> 16) & 255;
    }
    return out;
  }

  // ---------- the key, guessed from the notes played (Krumhansl–Kessler profiles, weighted by how long each note sounds) ----------
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : 0; }
  /** → { name: 'A minor', score } or null when there are too few notes or nothing fits clearly (the panel then asks). */
  function guessKey(notes = []) {
    const list = notes.filter(n => n && Number.isFinite(n.note));
    const pcs = new Array(12).fill(0); for (const n of list) pcs[((Math.round(n.note) % 12) + 12) % 12] += Math.max(0.05, Math.min(4, Number(n.length) || 0.25));
    if (list.length < 6 || pcs.filter(x => x > 0).length < 3) return null;
    let best = null;
    for (let t = 0; t < 12; t++) for (const [mode, prof] of [['major', MAJOR], ['minor', MINOR]]) {
      const r = corr(pcs, prof.map((_, i) => prof[(i - t + 12) % 12]));
      if (!best || r > best.score) best = { name: `${NAMES[t]} ${mode}`, tonic: t, mode, score: r };
    }
    return best && best.score >= 0.5 ? { name: best.name, score: Math.round(best.score * 1000) / 1000 } : null;
  }
  /** What the owner typed in the Key field, tidied ("am", "A min", "f# major" → "A minor", "F# major"); '' when empty or unclear. */
  function keyText(raw) {
    const m = /^\s*([a-g])\s*([#b♯♭]?)\s*(maj(or)?|min(or)?|m)?\s*$/i.exec(String(raw || '')); if (!m) return '';
    const acc = m[2].replace('♯', '#').replace('♭', 'b').toLowerCase(), note = m[1].toUpperCase() + (acc === 'b' ? 'b' : acc);
    const mode = !m[3] ? 'major' : /^m(in(or)?)?$/i.test(m[3]) && !/^maj/i.test(m[3]) ? 'minor' : 'major';
    return `${note} ${mode}`;
  }

  // ---------- a part's notes on the song's grid ----------
  /** notes in the take's seconds → the pad's seconds on bar 1: a stretched take plays `ratio` times faster (song / take
   *  tempo); notes past the part's end are dropped and the last one is cut there. */
  function padNotes(notes = [], { ratio = 1, seconds = Infinity } = {}) {
    const out = [];
    for (const n of notes) {
      if (!n || !Number.isFinite(n.time) || !(n.length > 0) || !(n.note >= 0 && n.note <= 127)) continue;
      const t = n.time / ratio; if (t < 0 || t >= seconds - 1e-9) continue;
      out.push({ note: Math.round(n.note), velocity: clamp(Math.round(n.velocity || 100), 1, 127), time: +t.toFixed(6), length: +Math.max(0.01, Math.min(n.length / ratio, seconds - t)).toFixed(6) });
    }
    return out.sort((a, b) => a.time - b.time || a.note - b.note);
  }

  // ---------- the README ----------
  /** info: { song, source, bpm, beats, key, keyFrom, bars, seconds, gainDb, files: [{ name, what }], skipped: [text], date } */
  function readme(info) {
    const L = [], key = info.key || '';
    L.push(`${info.song} — stems`, `Sent from Hearth's Sound desk on ${stamp(info.date || new Date())} (${info.source}).`, '');
    L.push(`Tempo: ${bpmText(info.bpm)} BPM, ${info.beats || 4}/4`);
    L.push(`Key: ${key ? key + (info.keyFrom ? ` (${info.keyFrom})` : '') : 'not known (type it next time in the Key box, or set it in your DAW)'}`);
    L.push(`Length: ${info.bars} bars (${(info.seconds || 0).toFixed(3)} s) — every WAV is exactly this long.`, '');
    L.push('How to use it:', '- Set your DAW\'s project to the tempo above, then drop all the WAVs in at bar 1 (the very start).',
      '  They all start at bar 1 and are the same length, so they line up to the sample.',
      '- Audio: 48 kHz, 24-bit WAV (stereo). A part that ends early is followed by silence; loops are there once (loop them in your DAW).',
      '- MIDI files start at bar 1 too, at the same tempo: drop one on a Serum 2 / Vital track to play the part again.');
    if (info.gainDb && info.gainDb < -0.005) L.push(`- Every file was turned down by ${Math.abs(info.gainDb).toFixed(1)} dB together so the mix stays under −1 dBFS (the stems still add up to the mix).`);
    else L.push('- Levels are as you heard them in Hearth (nothing was normalized).');
    L.push('', 'What each file is:');
    for (const f of info.files || []) L.push(`- ${f.name}: ${f.what}`);
    if (info.skipped?.length) { L.push('', 'Not included:'); for (const s of info.skipped) L.push(`- ${s}`); }
    L.push('');
    return L.join('\r\n');
  }
  return { RATE, BITS, CEILING_DB, MAX_SECONDS, clean, bpmText, stamp, folderName, fileName, presetName, barFrames, plan, fit, peakOf, safeGain, sum, wavHeader, dataBytes, pcm24, guessKey, keyText, padNotes, readme, NAMES };
});
