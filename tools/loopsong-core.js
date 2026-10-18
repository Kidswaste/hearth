/* (round 63, loopsong63) From park loops to a song: the arrangement's thinking, with no DOM and no runtime (Node tests
   require it: dev/loopsong63-test.js). Park takes (parkjam62: dry / layered WAV, MIDI, notes JSON in
   <data>/creative-park/<sketch>/) are laid as clips on four lanes plus a re-render lane, snapped to bars; the song's
   tempo comes from the takes; a take at another tempo is time-stretched (pitch kept) when it's close enough, otherwise
   it plays at its own tempo with a warning. One schedule drives both the window's Web Audio playback and the export's
   mixdown, so what you hear is what you get. The mix is normalized to −1 dBFS with the stems scaled by the same gain,
   so the stems add up to the mix.
   A song: { v, title, sketch, bpm, beats, rate, lanes: [{ name, mute, gain, rerender? }], clips: [clip], exports }
   A clip: { id, lane, start (bar), repeat, in, out (beats of the take), fadeIn, fadeOut (s), gain (dB), ambience
   (layered WAV when the take has one), stretch, take: { id, sketch, place, bpm, beats, bars, seconds, loop, layered,
   midi, notesFile, instrument }, rerender: null | { file, preset, instrument, at } } */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.LoopSongCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const LANES = 4, RERENDER = 4; // lanes 0–3 play the takes as recorded; lane 4 plays them re-rendered through the synth
  const STRETCH = [0.8, 1.25]; // song bpm / take bpm inside this range: time-stretched; outside: its own tempo + a warning
  const MAX_CLIPS = 48, MAX_REPEAT = 64, MAX_BARS = 256;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const uid = () => 'clip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const laneName = i => (i === RERENDER ? 'Re-render' : `Lane ${i + 1}`);

  function create({ title = 'Park song', sketch = 'Park sketch', bpm = null, beats = 4, rate = 48000 } = {}) {
    return { v: 1, title: String(title).slice(0, 80), sketch: String(sketch).slice(0, 160), bpm, beats, rate,
      lanes: Array.from({ length: LANES + 1 }, (_, i) => ({ name: laneName(i), mute: false, gain: 0, ...(i === RERENDER ? { rerender: true } : {}) })), clips: [], exports: [] };
  }
  /** A song read back from the project / a file: unknown fields dropped, numbers bounded, lanes always five. */
  function validate(raw) {
    const s = create(raw && typeof raw === 'object' ? raw : {}), r = raw && typeof raw === 'object' ? raw : {};
    s.bpm = Number.isFinite(r.bpm) && r.bpm >= 40 && r.bpm <= 240 ? r.bpm : null; s.beats = clamp(Math.round(num(r.beats, 4)), 2, 7); s.rate = [44100, 48000, 88200, 96000].includes(r.rate) ? r.rate : 48000;
    if (Array.isArray(r.lanes)) r.lanes.slice(0, LANES + 1).forEach((l, i) => { s.lanes[i].mute = !!l?.mute; s.lanes[i].gain = clamp(num(l?.gain, 0), -24, 6); });
    s.clips = (Array.isArray(r.clips) ? r.clips : []).filter(c => c?.take?.loop && typeof c.take.loop === 'string').slice(0, MAX_CLIPS).map(c => fixClip(c));
    s.exports = (Array.isArray(r.exports) ? r.exports : []).slice(0, 12);
    return s;
  }
  function fixClip(c) {
    const t = c.take, total = takeBeats(t);
    const clip = { id: typeof c.id === 'string' ? c.id : uid(), lane: clamp(Math.round(num(c.lane, 0)), 0, LANES), start: clamp(Math.round(num(c.start, 0)), 0, MAX_BARS - 1), repeat: clamp(Math.round(num(c.repeat, 1)), 1, MAX_REPEAT),
      in: 0, out: total, fadeIn: clamp(num(c.fadeIn, 0), 0, 30), fadeOut: clamp(num(c.fadeOut, 0), 0, 30), gain: clamp(num(c.gain, 0), -24, 6), ambience: c.ambience !== false && !!t.layered, stretch: c.stretch !== false,
      take: { id: String(t.id || ''), sketch: String(t.sketch || ''), place: String(t.place || ''), bpm: clamp(num(t.bpm, 120), 40, 240), beats: clamp(Math.round(num(t.beats, 4)), 2, 7), bars: clamp(Math.round(num(t.bars, 4)), 1, 64), seconds: num(t.seconds, 0), loop: t.loop, layered: t.layered || null, midi: t.midi || null, notesFile: t.notesFile || String(t.loop).replace(/\.wav$/i, '.json'), instrument: t.instrument || null, notes: num(t.notes, 0) },
      rerender: c.rerender && typeof c.rerender.file === 'string' ? { file: c.rerender.file, preset: String(c.rerender.preset || ''), instrument: String(c.rerender.instrument || ''), at: c.rerender.at || null } : null };
    trim(clip, num(c.in, 0), num(c.out, total));
    return clip;
  }
  const takeBeats = t => clamp(Math.round(num(t?.bars, 4)), 1, 64) * clamp(Math.round(num(t?.beats, 4)), 2, 7);

  // ---------- tempo ----------
  /** The song's tempo from the takes: the tempo most of them were played at (ties: the first one). */
  function tempoFrom(takes = []) {
    const count = new Map(); for (const t of takes) { const b = Math.round(num(t?.bpm, 0) * 100) / 100; if (b > 0) count.set(b, (count.get(b) || 0) + 1); }
    let best = null, n = 0; for (const [b, k] of count) if (k > n) { best = b; n = k; }
    return best;
  }
  /** How a clip meets the song's tempo: { ratio (song / take), stretch, bpm (what the clip plays at), warn }. */
  function tempoPlan(song, clip) {
    const b = clip.take.bpm, ratio = (song.bpm || b) / b;
    if (Math.abs(ratio - 1) < 1e-3) return { ratio: 1, stretch: false, bpm: b, warn: null };
    const fits = ratio >= STRETCH[0] && ratio <= STRETCH[1];
    if (clip.stretch && fits) return { ratio, stretch: true, bpm: song.bpm, warn: null };
    const why = !fits ? `too far from ${round(song.bpm)} BPM to stretch cleanly` : 'stretching is off for it';
    return { ratio, stretch: false, bpm: b, warn: `${label(clip)} is at ${round(b)} BPM in a ${round(song.bpm)} BPM song (${why}): it plays at its own tempo and drifts against the bars.` };
  }
  const round = v => Math.round(v * 10) / 10;
  const label = c => `${c.take.place || 'Take'} ${c.take.bars}-bar loop${c.rerender ? ' (re-rendered)' : ''}`;
  /** Plain warnings for the view and the chat: tempo mismatches, bar lengths, a take's missing MIDI on the re-render lane. */
  function warnings(song) {
    const out = [];
    for (const c of song.clips) {
      const p = tempoPlan(song, c); if (p.warn) out.push(p.warn);
      if (c.take.beats !== song.beats) out.push(`${label(c)} has ${c.take.beats} beats a bar; the song counts ${song.beats}.`);
      if (c.lane === RERENDER && !c.rerender) out.push(`${label(c)} is on the re-render lane: choose a preset and press Re-render (until then it is silent).`);
    }
    return [...new Set(out)];
  }

  // ---------- editing (everything snaps: bars for where a clip starts, beats for its trim) ----------
  const snapBar = x => clamp(Math.round(num(x, 0)), 0, MAX_BARS - 1);
  function addClip(song, take, { lane = 0, bar = null } = {}) {
    if (song.clips.length >= MAX_CLIPS) throw Error(`A song holds up to ${MAX_CLIPS} clips.`);
    if (!take?.loop) throw Error('That take has no loop file.');
    if (!song.bpm) { song.bpm = clamp(num(take.bpm, 120), 40, 240); song.beats = clamp(Math.round(num(take.beats, 4)), 2, 7); }
    const ln = clamp(Math.round(num(lane, 0)), 0, LANES);
    const c = fixClip({ id: uid(), lane: ln, start: bar == null ? endBar(song, ln) : snapBar(bar), take: { ...take, notesFile: take.notesFile || String(take.loop).replace(/\.wav$/i, '.json') } });
    song.clips.push(c); return c;
  }
  function find(song, id) { const c = song.clips.find(x => x.id === id) || song.clips[Number(id) - 1]; if (!c) throw Error('No such clip.'); return c; }
  function move(song, id, { lane, bar } = {}) { const c = find(song, id); if (lane != null) c.lane = clamp(Math.round(num(lane, c.lane)), 0, LANES); if (bar != null) c.start = snapBar(bar); return c; }
  function repeat(song, id, n) { const c = find(song, id); c.repeat = clamp(Math.round(num(n, 1)), 1, MAX_REPEAT); return c; }
  /** Trim to whole beats of the take: in ≥ 0, out ≤ its length, at least one beat kept. */
  function trim(c, a, b) {
    const total = takeBeats(c.take); let i = clamp(Math.round(num(a, 0)), 0, total - 1), o = clamp(Math.round(num(b, total)), 1, total);
    if (o <= i) o = Math.min(total, i + 1);
    c.in = i; c.out = o; return c;
  }
  function fade(song, id, { fadeIn, fadeOut } = {}) { const c = find(song, id); if (fadeIn != null) c.fadeIn = clamp(num(fadeIn, 0), 0, 30); if (fadeOut != null) c.fadeOut = clamp(num(fadeOut, 0), 0, 30); return c; }
  function remove(song, id) { const c = find(song, id); song.clips.splice(song.clips.indexOf(c), 1); return c; }
  /** Where a clip begins / ends in the song, in bars (a clip at its own tempo ends wherever its seconds take it). */
  function span(song, c) {
    const p = tempoPlan(song, c), seg = (c.out - c.in) * 60 / p.bpm, barSec = song.beats * 60 / song.bpm;
    return { start: c.start, bars: (seg * c.repeat) / barSec, seconds: seg * c.repeat, segment: seg };
  }
  function endBar(song, lane) { let end = 0; for (const c of song.clips) if (lane == null || c.lane === lane) end = Math.max(end, Math.ceil(c.start + span(song, c).bars - 1e-9)); return end; }
  const bars = song => Math.max(1, endBar(song));

  // ---------- the schedule: what plays where (Web Audio playback and the export both use it) ----------
  /** [{ clip, lane, at, offset, dur, gain, fadeIn, fadeOut, first, last, clipAt, clipDur, source: 'loop' | 'layered' | 'rerender' }]
   *  at / dur in song seconds, offset in seconds of the prepared source (stretched when plan.stretch). */
  function schedule(song) {
    const out = [];
    if (!song.bpm) return out;
    const spb = 60 / song.bpm;
    for (const c of song.clips) {
      const lane = song.lanes[c.lane]; if (!lane) continue;
      const p = tempoPlan(song, c), segBeats = c.out - c.in, segDur = segBeats * 60 / p.bpm, offset = c.in * 60 / p.bpm;
      const clipAt = c.start * song.beats * spb, clipDur = segDur * c.repeat, g = 10 ** (c.gain / 20);
      const source = c.lane === RERENDER ? (c.rerender ? 'rerender' : null) : c.ambience && c.take.layered ? 'layered' : 'loop';
      if (!source) continue;
      for (let r = 0; r < c.repeat; r++) out.push({ clip: c.id, lane: c.lane, at: clipAt + r * segDur, offset, dur: segDur, gain: g, fadeIn: Math.min(c.fadeIn, clipDur / 2), fadeOut: Math.min(c.fadeOut, clipDur / 2), first: r === 0, last: r === c.repeat - 1, clipAt, clipDur, source, stretch: p.stretch, ratio: p.ratio });
    }
    return out.sort((a, b) => a.at - b.at || a.lane - b.lane);
  }
  const EDGE = 0.002; // 2 ms ramps at every segment's edges (a trimmed loop never clicks at its seams)
  /** The gain envelope at time t (seconds into the segment): clip fades, segment edge ramps. */
  function envelope(seg, t) {
    const tc = seg.at - seg.clipAt + t; let e = 1;
    if (seg.fadeIn > 0) e = Math.min(e, tc / seg.fadeIn);
    if (seg.fadeOut > 0) e = Math.min(e, (seg.clipDur - tc) / seg.fadeOut);
    if (!(seg.first && seg.fadeIn > 0)) e = Math.min(e, t / EDGE);
    if (!(seg.last && seg.fadeOut > 0)) e = Math.min(e, (seg.dur - t) / EDGE);
    return clamp(e, 0, 1);
  }
  const duration = song => schedule(song).reduce((n, s) => Math.max(n, s.at + s.dur), 0);
  /** Where the source of a clip comes from (file paths) and the stretch it needs: what the window prepares. */
  function sourceOf(song, c) {
    const p = tempoPlan(song, c), file = c.lane === RERENDER ? c.rerender?.file : c.ambience && c.take.layered ? c.take.layered : c.take.loop;
    return file ? { file, ratio: p.stretch ? p.ratio : 1, key: `${file}|${p.stretch ? p.ratio.toFixed(5) : 1}|${song.rate}` } : null;
  }

  // ---------- mixdown ----------
  /** Renders the schedule. sources: { [clipId]: { rate, channels } } at song.rate (stretched already).
   *  → { rate, length, lanes: [[L, R] | null], mix: [L, R], peak } (lanes that play nothing are null). */
  function render(song, sources, { rate = song.rate } = {}) {
    const segs = schedule(song), len = Math.max(1, Math.ceil(duration(song) * rate));
    const lanes = song.lanes.map(() => null), lg = song.lanes.map(l => 10 ** (num(l.gain, 0) / 20));
    for (const s of segs) {
      const src = sources[s.clip]; if (!src?.channels?.length) continue;
      const out = lanes[s.lane] ||= [new Float32Array(len), new Float32Array(len)];
      const at = Math.round(s.at * rate), off = Math.round(s.offset * rate), n = Math.min(Math.round(s.dur * rate), len - at), g = s.gain * lg[s.lane];
      const L = src.channels[0], R = src.channels[1] || L;
      for (let i = 0; i < n; i++) {
        const j = off + i; if (j >= L.length) break;
        const e = g * envelope(s, i / rate); if (!e) continue;
        out[0][at + i] += L[j] * e; out[1][at + i] += R[j] * e;
      }
    }
    const mix = [new Float32Array(len), new Float32Array(len)]; let peak = 0;
    song.lanes.forEach((l, k) => { const x = lanes[k]; if (!x || l.mute) return; for (let c = 0; c < 2; c++) for (let i = 0; i < len; i++) mix[c][i] += x[c][i]; });
    for (const ch of mix) for (let i = 0; i < len; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
    return { rate, length: len, lanes, mix, peak };
  }
  /** The mix to −1 dBFS (or `db`), every stem scaled by the same gain so the stems still add up to the mix. */
  function normalize(r, db = -1) {
    if (!(r.peak > 0)) return { ...r, gain: 1, gainDb: 0 };
    const gain = 10 ** (db / 20) / r.peak, scale = x => x && x.map(ch => { const o = new Float32Array(ch.length); for (let i = 0; i < ch.length; i++) o[i] = ch[i] * gain; return o; });
    return { ...r, mix: scale(r.mix), lanes: r.lanes.map(scale), peak: r.peak * gain, gain, gainDb: 20 * Math.log10(gain) };
  }

  // ---------- time-stretch (WSOLA: the pitch stays, the tempo moves) ----------
  /** channels stretched so a take at bpm b plays at b × ratio: length / ratio samples. A short window (≈ 43 ms at 48 kHz)
   *  overlap-added with a Hann window; each next grain is the one (±10 ms) that best continues the last one. */
  function stretch(channels, ratio, { size = 2048, tolerance = 512 } = {}) {
    if (!(ratio > 0) || Math.abs(ratio - 1) < 1e-4) return channels.map(ch => Float32Array.from(ch));
    const n = channels[0].length, outLen = Math.max(1, Math.round(n / ratio)), hop = size / 2, ana = hop * ratio;
    const win = new Float32Array(size); for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size); // periodic Hann: 50 % overlap sums to 1
    const mono = new Float32Array(n); for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i] / channels.length;
    const out = channels.map(() => new Float32Array(outLen + size)), norm = new Float32Array(outLen + size);
    let prev = 0; // where the last grain was taken from
    for (let k = 0, o = 0; o < outLen; k++, o += hop) {
      const nominal = Math.round(k * ana);
      let pos = Math.min(Math.max(0, nominal), Math.max(0, n - size));
      if (k > 0) { // the grain whose start best matches where the previous grain would naturally have continued
        const want = prev + hop, lo = Math.max(0, pos - tolerance), hi = Math.min(Math.max(0, n - size), pos + tolerance);
        let best = pos, score = -Infinity;
        for (let p = lo; p <= hi; p += 2) { let s = 0; for (let i = 0; i < hop; i += 4) { const a = want + i, b = p + i; if (a >= n || b >= n) break; s += mono[a] * mono[b]; } if (s > score) { score = s; best = p; } }
        pos = best;
      }
      for (let c = 0; c < channels.length; c++) { const src = channels[c], dst = out[c]; for (let i = 0; i < size; i++) { const j = pos + i; if (j >= n) break; dst[o + i] += src[j] * win[i]; } }
      for (let i = 0; i < size; i++) norm[o + i] += win[i];
      prev = pos;
    }
    return out.map(ch => { const r = new Float32Array(outLen); for (let i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? ch[i] / Math.max(norm[i], 0.5) : ch[i]; return r; });
  }
  function resample(ch, from, to) {
    if (from === to || !ch.length) return Float32Array.from(ch);
    const n = Math.max(1, Math.round(ch.length * to / from)), out = new Float32Array(n), r = from / to;
    for (let i = 0; i < n; i++) { const p = i * r, j = Math.floor(p), t = p - j; out[i] = (ch[j] ?? 0) * (1 - t) + (ch[Math.min(j + 1, ch.length - 1)] ?? 0) * t; }
    return out;
  }
  /** A decoded take → the clip's source: stereo, at the song's rate, stretched by ratio. */
  function prepare(pcm, { rate = 48000, ratio = 1 } = {}) {
    let chs = pcm.channels.slice(0, 2); if (chs.length === 1) chs = [chs[0], chs[0]];
    chs = chs.map(ch => resample(ch, pcm.rate, rate));
    return { rate, channels: ratio !== 1 ? stretch(chs, ratio) : chs };
  }

  // ---------- the song's MIDI: every clip's notes where it plays (re-rendered clips included) ----------
  /** notesOf: { [clipId]: [{ note, time, length, velocity }] } in the take's seconds. → notes in song seconds. */
  function songNotes(song, notesOf) {
    const out = [];
    for (const s of schedule(song)) {
      if (song.lanes[s.lane]?.mute) continue;
      const c = song.clips.find(x => x.id === s.clip), list = notesOf[s.clip] || [], p = tempoPlan(song, c), scale = c.take.bpm / p.bpm;
      for (const n of list) {
        const beat = n.time * c.take.bpm / 60; if (beat < c.in - 1e-6 || beat >= c.out - 1e-6) continue;
        const t = s.at + (beat - c.in) * 60 / p.bpm; if (t >= s.at + s.dur) continue;
        out.push({ note: n.note, velocity: n.velocity || 100, time: +t.toFixed(6), length: +Math.max(0.01, Math.min(n.length * scale, s.at + s.dur - t)).toFixed(6) });
      }
    }
    return out.sort((a, b) => a.time - b.time || a.note - b.note);
  }
  /** Notes for the re-render: the take's notes inside its trim, from the first note at 0 (the recorder starts there). */
  function rerenderNotes(take, notes = []) {
    const list = notes.filter(n => n && Number.isFinite(n.time) && n.length > 0 && n.note >= 0 && n.note <= 127).sort((a, b) => a.time - b.time).slice(0, 256);
    if (!list.length) return { lead: 0, notes: [] };
    const lead = list[0].time;
    return { lead, notes: list.map(n => ({ note: n.note, velocity: n.velocity || 100, time: +(n.time - lead).toFixed(6), length: +n.length.toFixed(6) })) };
  }
  /** The recorder starts on the first note: the take's lead-in silence goes back in front, cut to the take's length. */
  function realign(pcm, lead, total) {
    const pad = Math.round(lead * pcm.rate);
    return { rate: pcm.rate, channels: pcm.channels.map(ch => { const o = new Float32Array(total); o.set(ch.subarray(0, Math.max(0, total - pad)), Math.min(pad, total)); return o; }) };
  }

  // ---------- export names, the proof ----------
  const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}`;
  /** File names (parkjam62's parkSave rules: letters, digits, space . · -, ≤ 80 characters). */
  function exportNames(song, date = new Date()) {
    const base = `${String(song.title || 'Park song').replace(/[^\w .·-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Park song'} ${stamp(date)}`;
    return { mix: `${base} mix.wav`, mp3: `${base} mix.mp3`, midi: `${base}.mid`, json: `${base} song.json`, stem: i => `${base} stem ${i + 1} ${laneName(i).replace(/[^\w -]/g, '')}.wav` };
  }
  function proofText(song, analysis, { stems = 0, mp3 = false } = {}) {
    const takes = [...new Set(song.clips.map(c => `${c.take.place || 'park'} ${c.take.bars}-bar loop at ${round(c.take.bpm)} BPM`))];
    const rr = song.clips.filter(c => c.rerender).map(c => `${c.rerender.instrument || 'synth'} · ${c.rerender.preset || 'preset'}`);
    const excerpt = [`Park song · ${song.title} · ${bars(song)} bars at ${round(song.bpm)} BPM · ${duration(song).toFixed(1)} s`,
      `${song.clips.length} clips from ${takes.length} park take(s): ${takes.join('; ')}`,
      rr.length ? `Re-rendered through the synth with another preset: ${rr.join('; ')}` : '',
      `Exported: a mix normalized to −1 dBFS, ${stems} stem(s), the MIDI${mp3 ? ', an MP3' : ''}`, `Sketch: ${song.sketch}`].filter(Boolean).join('\n').slice(0, 20000);
    return { excerpt, analysis: JSON.stringify({ ...analysis, bars: bars(song), bpm: song.bpm, clips: song.clips.length }).slice(0, 6000),
      coverage: 'Technical audio/documentation review only: the mix’s decoded duration and sampled levels, plus the arrangement (which loops, where, how often). Astra cannot hear this audio; no claims about melody, groove, mix taste or emotional quality.'.slice(0, 600) };
  }
  /** The "Finish a track" personal quest, kind and small (added to QuestParis.personal when it isn't there). */
  const TRACK_QUEST = { key: 'track', id: 'c-pq-track', title: 'Finish a track', subtitle: 'MUSIC / FINISH LINE', path: 'music', aliases: ['finish', 'arrange', 'bounce'], why: 'Loops are the fun part; a finished track is the gift to yourself. Done beats perfect: two minutes with a start, a middle and an end.', badge: 'Finisher', steps: [
    ['Pick the loops that belong together', 'Choose two or three loops you still like (park takes count), and lay them out in order: a start, a middle, an end. Save a one-line note of the order.', 'Play your last three loops once each.', 15, 25],
    ['Bounce the whole thing', 'Arrange it to about two minutes, fade the ends, and export the mix. It does not need to be perfect; it needs to be finished. Save the bounce.', 'Put the first loop on bar 1.', 30, 45],
    ['Listen once and name it', 'Listen once from start to end without changing anything, give it a name, and write one line about what you would keep for the next one.', 'Press play and put your hands in your lap.', 10, 30]
  ] };
  return { LANES, RERENDER, STRETCH, MAX_CLIPS, laneName, create, validate, tempoFrom, tempoPlan, warnings, snapBar, addClip, find, move, repeat, trim, fade, remove, span, endBar, bars, schedule, envelope, duration, sourceOf, render, normalize, stretch, resample, prepare, songNotes, rerenderNotes, realign, exportNames, proofText, TRACK_QUEST, stamp };
});
