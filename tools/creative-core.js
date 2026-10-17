// Portable deterministic generators. No files, network, model calls or shared Lab state.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreativeCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const FEATURES = [
    ['studio', 'Workbenches', 'The worktable', 'Six creative stations with projects and usable exports.'],
    ['vst', 'Workbenches', 'Plugin vault', 'Host your installed VST3 instruments and effects.'],
    ['instrument', 'Workbenches', 'Ember sound forge', 'Oscillators, ADSR and effects for your next sample.'],
    ['editor', 'Workbenches', 'Pocket worlds', 'Paint levels, tune rules and export playable games.'],
    ['texture', 'Workbenches', 'Material foundry', 'Seamless color, normal, height and roughness maps.'],
    ['draw', 'Workbenches', 'Sketch to asset', 'Draw sprites, masks and illustrations for your projects.'],
    ['story', 'Workbenches', 'Storyboard table', 'Arrange shots and play a timed animatic.'],
    ['poster', 'Visuals', 'Palette posters', 'Seeded geometric compositions and five-color palettes.'],
    ['pattern', 'Visuals', 'Seamless tiles', 'Repeatable geometric patterns for textures and backgrounds.'],
    ['motion', 'Visuals', 'Motion loops', 'Tempo-linked orbit, tunnel and ribbon studies.'],
    ['sprite', 'Visuals', 'Sprite forge', 'Mirrored pixel creatures with transparent exports.'],
    ['reactive', 'Visuals', 'Sound to light', 'Watch your generated or imported audio drive a visual.'],
    ['drums', 'Music', 'Beat sketcher', 'Four voices, sixteen editable steps, swing and WAV export.'],
    ['melody', 'Music', 'Melody garden', 'Seeded scale-aware phrases with MIDI and WAV export.'],
    ['sfx', 'Music', 'Game sound lab', 'Make pickup, jump, laser and impact samples.'],
    ['slice', 'Music', 'Sample cutter', 'Import audio, trim, reverse, normalize and fade a slice.'],
    ['rack', 'Music', 'Pocket effects', 'Drive, low-pass, echo and lo-fi processing for your sound.'],
    ['arena', 'Games', 'Arcade builder', 'A playable collect-and-dodge game to remix and export.'],
    ['maze', 'Games', 'Maze builder', 'Seeded solvable mazes, playable here and as HTML.'],
    ['rhythm', 'Games', 'Rhythm runner', 'Four-lane beat challenges with adjustable tempo.'],
    ['quests', 'Daily', 'Daily quests', 'Three daily creative challenges, journal and focus timer.'],
    ['inspire', 'Daily', 'Idea mixer', 'Constraint-led briefs, saved ideas and an Astra handoff.'],
  ].map(([id, group, name, description]) => ({ id, group, name, description }));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, Number.isFinite(+x) ? +x : a));
  function hash(value) { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function random(seed) { let s = hash(seed); return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function palette(seed) { const r = random(seed), hue = Math.floor(r() * 360); return [0, 25, 170, 205, 320].map((d, i) => `hsl(${(hue + d) % 360} 72% ${[14, 36, 62, 78, 92][i]}%)`); }
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function svg(seed, type = 'poster') {
    const r = random(seed), colors = palette(seed); let body = '';
    if (type === 'sprite') {
      for (let y = 1; y < 15; y++) for (let x = 1; x < 8; x++) if (r() > .45) {
        const fill = colors[1 + Math.floor(r() * 4)];
        for (const xx of [x, 15 - x]) body += `<rect x="${xx * 32}" y="${y * 32}" width="32" height="32" fill="${fill}"/>`;
      }
    } else if (type === 'pattern') {
      const c = colors[2];
      body = `<defs><pattern id="tile" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${colors[0]}"/><path d="M0 32L32 0L64 32L32 64Z" fill="none" stroke="${c}" stroke-width="${2 + Math.floor(r() * 7)}"/><circle cx="32" cy="32" r="${5 + Math.floor(r() * 12)}" fill="${colors[3]}"/></pattern></defs><rect width="512" height="512" fill="url(#tile)"/>`;
    } else {
      body = `<rect width="512" height="512" fill="${colors[0]}"/>`;
      for (let i = 0; i < 28; i++) {
        const x = Math.round(r() * 512), y = Math.round(r() * 512), size = Math.round(15 + r() * 110), fill = colors[1 + i % 4];
        body += i % 2 ? `<circle cx="${x}" cy="${y}" r="${size}" fill="${fill}" opacity=".7"/>` : `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" transform="rotate(${Math.floor(r() * 90)} ${x} ${y})"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Hearth ${escape(type)} · ${escape(seed)}</title>${body}</svg>`;
  }
  function drums(seed) { const r = random(seed); return Array.from({ length: 4 }, (_, row) => Array.from({ length: 16 }, (_, i) => row === 0 ? i % 4 === 0 || r() > .93 : row === 1 ? i % 8 === 4 : row === 2 ? i % 2 === 0 || r() > .72 : r() > .82)); }
  function melody(seed, root = 60, scale = 'minor') {
    const r = random(seed), steps = scale === 'major' ? [0, 2, 4, 5, 7, 9, 11] : scale === 'pentatonic' ? [0, 3, 5, 7, 10] : [0, 2, 3, 5, 7, 8, 10];
    return Array.from({ length: 32 }, (_, i) => ({ beat: i * .5, duration: i % 8 === 7 ? .9 : .4, note: Math.round(clamp(root, 36, 84)) + steps[Math.floor(r() * steps.length)], velocity: i % 4 === 0 ? .8 : .55 }));
  }
  function synth(kind, seconds, sr = 22050, seed = 'sound', pitch = 1) {
    seconds = clamp(seconds, .03, 8); sr = Math.round(clamp(sr, 8000, 48000)); pitch = clamp(pitch, .25, 4);
    const out = new Float32Array(Math.round(sr * seconds)), r = random(seed); let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sr, f = kind === 'kick' ? 48 + 130 * Math.exp(-t * 40) : kind === 'laser' ? 100 + 1800 * Math.exp(-t * 10) : kind === 'jump' ? 180 + t * 1200 : kind === 'pickup' ? (t < seconds / 2 ? 660 : 990) : 190;
      phase += 2 * Math.PI * f * pitch / sr;
      const noise = r() * 2 - 1;
      const wave = kind === 'hat' ? noise : kind === 'snare' || kind === 'impact' ? noise * .7 + Math.sin(phase) * .3 : Math.sin(phase);
      const env = Math.min(1, t * 500) * Math.exp(-t * (kind === 'hat' ? 55 : kind === 'kick' ? 14 : 7)) * Math.min(1, (seconds - t) * 200);
      out[i] = wave * env * .65;
    }
    return out;
  }
  function normalize(input) { let max = 0; for (const v of input) max = Math.max(max, Math.abs(v)); const gain = max > 0 ? .9 / max : 1; return Float32Array.from(input, v => v * gain); }
  function mix(out, samples, start, gain = 1) { const offset = Math.round(start); for (let i = 0; i < samples.length && offset + i < out.length; i++) if (offset + i >= 0) out[offset + i] += samples[i] * gain; }
  function beatAudio(pattern, bpm = 120, swing = 0, sr = 22050) {
    const step = 60 / clamp(bpm, 40, 220) / 4, out = new Float32Array(Math.round(step * 16 * sr));
    ['kick', 'snare', 'hat', 'pickup'].forEach((kind, row) => {
      const sound = synth(kind, row === 2 ? .1 : .28, sr, 'drum-' + row);
      for (let i = 0; i < 16; i++) if (pattern[row]?.[i]) mix(out, sound, (i + (i % 2 ? clamp(swing, 0, .45) : 0)) * step * sr, row === 3 ? .45 : 1);
    }); return normalize(out);
  }
  function melodyAudio(notes, bpm = 120, sr = 22050) {
    const beat = 60 / clamp(bpm, 40, 220), end = Math.max(16, ...notes.map(n => n.beat + n.duration));
    const out = new Float32Array(Math.ceil(end * beat * sr));
    for (const n of notes) {
      const size = Math.round(n.duration * beat * sr), wave = new Float32Array(size), f = 440 * 2 ** ((n.note - 69) / 12);
      for (let i = 0; i < size; i++) { const t = i / sr; wave[i] = (Math.sin(t * f * Math.PI * 2) + .2 * Math.sin(t * f * Math.PI * 4)) * Math.min(1, i / 150, (size - 1 - i) / 300) * n.velocity * .4; }
      mix(out, wave, n.beat * beat * sr);
    } return normalize(out);
  }
  function effects(input, sr, { drive = 0, cutoff = 10000, echo = 0, crush = 0 } = {}) {
    drive = clamp(drive, 0, 1); cutoff = clamp(cutoff, 80, sr / 2); echo = clamp(echo, 0, .7); crush = Math.round(clamp(crush, 0, 12));
    const out = new Float32Array(input.length), alpha = 1 - Math.exp(-2 * Math.PI * cutoff / sr), delay = Math.round(sr * .25); let lp = 0, held = 0;
    for (let i = 0; i < input.length; i++) {
      let v = input[i]; if (drive) v = Math.tanh(v * (1 + drive * 15)) / Math.tanh(1 + drive * 15);
      lp += alpha * (v - lp); v = lp;
      if (crush) { if (i % (crush + 1) === 0) held = Math.round(v * 32) / 32; v = held; }
      out[i] = v + (i >= delay ? out[i - delay] * echo : 0);
    } return normalize(out);
  }
  function slice(input, sr, start, end, reverse = false) {
    start = clamp(start, 0, input.length / sr); end = clamp(end, 0, input.length / sr);
    if (end - start < .01) throw new Error('Choose an end at least 0.01 seconds after the start.');
    const out = input.slice(Math.floor(start * sr), Math.min(input.length, Math.ceil(end * sr)));
    if (reverse) out.reverse(); const fade = Math.min(Math.floor(sr * .005), Math.floor(out.length / 2));
    for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[out.length - 1 - i] *= i / fade; }
    return normalize(out);
  }
  function wav(samples, sr = 22050) {
    const bytes = new Uint8Array(44 + samples.length * 2), v = new DataView(bytes.buffer);
    const text = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, samples.length * 2, true);
    samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(clamp(x, -1, 1) * 32767), true)); return bytes;
  }
  function midi(notes, bpm = 120) {
    const vlq = n => { const a = [n & 127]; while ((n >>= 7)) a.unshift((n & 127) | 128); return a; };
    const tempo = Math.round(60000000 / clamp(bpm, 40, 220));
    const track = [0, 255, 81, 3, tempo >> 16 & 255, tempo >> 8 & 255, tempo & 255];
    const events = notes.flatMap(n => [{ t: Math.round(n.beat * 480), off: false, n }, { t: Math.round((n.beat + n.duration) * 480), off: true, n }]).sort((a, b) => a.t - b.t || Number(b.off) - Number(a.off));
    let last = 0; for (const e of events) { track.push(...vlq(e.t - last), e.off ? 128 : 144, Math.round(clamp(e.n.note, 0, 127)), e.off ? 0 : Math.round(clamp(e.n.velocity, 0, 1) * 127)); last = e.t; }
    track.push(0, 255, 47, 0); const size = track.length;
    return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, size >>> 24, size >>> 16 & 255, size >>> 8 & 255, size & 255, ...track]);
  }
  function maze(seed, w = 23, h = 17) {
    w = Math.floor(clamp(w, 9, 39)) | 1; h = Math.floor(clamp(h, 9, 31)) | 1;
    const r = random(seed), grid = Array.from({ length: h }, () => Array(w).fill(1)), stack = [[1, 1]]; grid[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack.at(-1), candidates = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => x + dx > 0 && x + dx < w - 1 && y + dy > 0 && y + dy < h - 1 && grid[y + dy][x + dx]);
      if (!candidates.length) { stack.pop(); continue; }
      const [dx, dy] = candidates[Math.floor(r() * candidates.length)]; grid[y + dy / 2][x + dx / 2] = grid[y + dy][x + dx] = 0; stack.push([x + dx, y + dy]);
    } return { grid, start: [1, 1], goal: [w - 2, h - 2], width: w, height: h };
  }
  const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function brief(seed, medium = 'visual') {
    const r = random(seed), pick = xs => xs[Math.floor(r() * xs.length)];
    const subject = pick(['a floating observatory', 'a tiny nocturnal creature', 'a city made of echoes', 'a garden under glass', 'a lost arcade', 'a signal from the ocean', 'an impossible clock', 'a forest of antennas']);
    const mood = pick(['tender', 'uneasy', 'joyful', 'weightless', 'ritualistic', 'curious', 'restless', 'dreamlike']);
    const rule = pick(['use only three colors', 'let silence or empty space lead', 'repeat one motif with a small mutation', 'start slowly, then reverse the energy', 'make the smallest detail the hero', 'use an unexpected rhythm']);
    return { title: `${mood[0].toUpperCase() + mood.slice(1)} · ${subject}`, medium, text: `Make a ${medium} study about ${subject}. Make it feel ${mood}; ${rule}. Build a first version in 20 minutes. Finish with one deliberate surprise.`, palette: palette(seed), seed: String(seed) };
  }
  function quests(day) { return ['visual', 'music', 'game'].map((medium, i) => { const b = brief(day + ':' + i, medium), minutes = [15, 20, 30][i]; return { ...b, text: b.text.replace('20 minutes', `${minutes} minutes`), id: day + ':' + medium, minutes }; }); }
  function streak(doneDays, day = localDay()) {
    const dates = new Set(doneDays); const d = new Date(day + 'T12:00:00'); let n = 0;
    if (!dates.has(localDay(d))) d.setDate(d.getDate() - 1);
    while (dates.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); } return n;
  }
  return { FEATURES, clamp, hash, random, palette, svg, drums, melody, synth, normalize, beatAudio, melodyAudio, effects, slice, wav, midi, maze, localDay, brief, quests, streak };
});
