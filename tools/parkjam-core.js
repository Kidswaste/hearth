/* (round 62, parkjam62) Park jam: making music outside on the laptop, on battery, maybe without the UA interface.
   The thinking, with no DOM and no runtime (Node tests require it: dev/parkjam62-test.js): which output Park mode
   picks, a safe buffer, the battery-friendly control changes, loop lengths, WAV read / write, the park ambience
   layered under a loop, a MIDI file of the notes played, the proof text for the park quest, the week a take is in.
   It plugs into Codex's Sound desk (tools/workbench-vst.js) through tools/parkjam.js; values for the picker use the
   desk's own format (WorkbenchVSTLive.parse: '<id>' shared, '<id>x' WASAPI exclusive, '' the system output). */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(require('./workbench-vst-live.js')); else root.ParkJamCore = make(root.WorkbenchVSTLive); })(typeof self !== 'undefined' ? self : globalThis, L => {
  const UA = L?.UA || /universal audio|apollo|\bvolt\b|\buad?\b/i;
  // The laptop's own outputs, in every spelling Windows / macOS give them: built-in speakers, the headphone jack
  // (a Mac calls it "External Headphones"), Realtek / Intel SST / Conexant / Cirrus codecs.
  const BUILTIN = /built-?in|internal|macbook|laptop|realtek|intel.*(smart sound|sst|display audio)|conexant|cirrus|\bspeakers?\b|external headphones|headphones? \(realtek|high definition audio/i;
  const PHONES = /head(phone|set)s?|casque|airpods|ear(buds|phones)|\bbuds\b/i;
  const BLUETOOTH = /bluetooth|airpods|hands-?free|\bbt\b|wh-1000|wf-1000|buds|beats|bose|jabra/i;
  const HANDSFREE = /hands-?free|\bhfp\b/i; // Bluetooth's phone-call profile: mono, 16 kHz, never for music
  const SHARED_APIS = { 'Windows WASAPI': 0, 'Core Audio': 0, ALSA: 1, 'Windows WDM-KS': 2, 'Windows DirectSound': 3, MME: 4 };
  const hasUA = (r = {}) => (r.devices || []).some(d => UA.test(d?.name || ''));

  /** The output Park mode plays on. The UA interface connected: keep it (ASIO, as the desk picks it). Otherwise the
   *  laptop's own output, never an exclusive mode (other apps keep their sound) and never a Bluetooth hands-free
   *  profile: the system default when it's the headphones (wired or Bluetooth, with a latency note) or built-in,
   *  else the built-in speakers / headphone jack, else the default, else the system output. → { value, why, kind, name } */
  function parkOutput(r = {}) {
    const list = (r.devices || []).filter(d => d && Number.isInteger(d.id) && typeof d.name === 'string' && typeof d.api === 'string');
    if (hasUA(r)) {
      const opts = L ? L.options(r) : null;
      const value = opts?.preferred ?? '', d = list.find(x => x.id === L?.parse(value).device);
      return { value, kind: 'ua', name: d?.name || 'Universal Audio', why: 'Your Universal Audio interface is connected, so Park mode keeps it.' };
    }
    const rows = list.filter(d => d.api in SHARED_APIS && !HANDSFREE.test(d.name));
    const isDefault = d => d.default === true || d.id === r.preferred;
    const score = d => {
      const builtin = BUILTIN.test(d.name) && !BLUETOOTH.test(d.name), phones = PHONES.test(d.name), bt = BLUETOOTH.test(d.name);
      let s = isDefault(d) && phones ? 0 : builtin && phones ? 1 : isDefault(d) && builtin ? 2 : builtin ? 3 : isDefault(d) && !bt ? 4 : bt ? 8 : 6;
      return s * 10 + SHARED_APIS[d.api];
    };
    const best = rows.sort((a, b) => score(a) - score(b) || a.id - b.id)[0];
    if (!best) return { value: '', kind: 'system', name: 'System output', why: 'No laptop output was listed, so Park mode uses the system output.' };
    const bt = BLUETOOTH.test(best.name);
    return { value: String(best.id), kind: bt ? 'bluetooth' : PHONES.test(best.name) ? 'headphones' : 'builtin', name: best.name,
      why: bt ? `${best.name}: Bluetooth adds about 150–250 ms, fine for loops, late for playing keys (wired headphones are tighter).` : `No UA interface: ${best.name}, shared with other apps.` };
  }
  /** A buffer that doesn't crackle on a laptop on battery: 256 on ASIO, 512 on the shared laptop output (the
   *  Windows audio engine runs ~10 ms periods anyway), 1024 on the slow legacy APIs. */
  function safeBuffer(api, { battery = true } = {}) {
    if (api === 'ASIO') return battery ? 256 : 128;
    if (api === 'MME' || api === 'Windows DirectSound') return 1024;
    return 512;
  }
  // ---------- battery-friendly controls (only where the plugin exposes them) ----------
  const POLY = /polyphon|\bvoices?\b(?! *(mode|unison))|voice count|max voices/i;
  const OVER = /oversampl|\bhq\b|high quality|quality/i;
  /** Lower polyphony (≤ 8 voices) and oversampling (the lowest choice / off) where a plugin exposes them as real values.
   *  parameters: the desk's entries { key, label, value, min, max, choices }. → { values, before, changed: [label] } */
  function batterySaver(parameters = [], { voices = 8 } = {}) {
    const values = {}, before = {}, changed = [];
    for (const p of parameters) {
      if (!p || typeof p.key !== 'string') continue;
      const words = `${p.label || ''} ${p.key}`;
      if (/unison|\bmod(ulation)?\b|\blfo|\benv(elope)?\b|macro/i.test(words)) continue; // "Unison voices", a macro named "voices": never ours to change
      if (POLY.test(words) && typeof p.value === 'number' && Number.isFinite(p.max) && p.max > 1.5) {
        const target = Math.max(p.min ?? 1, Math.min(voices, p.max));
        if (p.value > target) { values[p.key] = target; before[p.key] = p.value; changed.push(`${p.label || p.key} ${Math.round(p.value)} → ${target}`); }
      } else if (OVER.test(words)) {
        if (typeof p.value === 'boolean' && p.value) { values[p.key] = false; before[p.key] = true; changed.push(`${p.label || p.key} off`); }
        else if (typeof p.value === 'string' && Array.isArray(p.choices) && p.choices.length > 1) {
          const low = lowestChoice(p.choices); if (low != null && low !== p.value) { values[p.key] = low; before[p.key] = p.value; changed.push(`${p.label || p.key} ${p.value} → ${low}`); }
        } else if (typeof p.value === 'number' && Number.isFinite(p.min) && p.max > 1.5 && p.value > p.min) { values[p.key] = p.min; before[p.key] = p.value; changed.push(`${p.label || p.key} ${p.value} → ${p.min}`); }
      }
    }
    return { values, before, changed };
  }
  // "1x" / "off" / "none" / "draft" first; else the smallest number in the names; else the first choice.
  function lowestChoice(choices) {
    const plain = choices.find(c => /^(off|none|1x|x1|1|draft|eco|low)$/i.test(String(c).trim()));
    if (plain != null) return plain;
    const num = choices.map(c => [c, parseFloat(String(c).replace(/[^\d.]/g, ''))]).filter(([, n]) => Number.isFinite(n)).sort((a, b) => a[1] - b[1]);
    return num.length ? num[0][0] : choices[0];
  }
  // ---------- loops ----------
  const BARS = [4, 8, 16];
  const loopSeconds = (bars = 4, bpm = 120, beats = 4) => bars * beats * 60 / bpm;
  function loopArgs(words = '') {
    const w = String(words).toLowerCase(), n = (w.match(/\b(4|8|16)\b(?!\s*bpm)/) || [])[1], bpm = (w.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/) || w.match(/\bbpm\s*(\d{2,3})\b/) || [])[1];
    return { bars: n ? Number(n) : null, bpm: bpm ? Math.max(50, Math.min(220, Number(bpm))) : null, now: /\b(now|right away|straight)\b/.test(w), ambience: /\b(ambience|ambiance|mic|field)\b/.test(w) ? true : /\bdry\b/.test(w) ? false : null };
  }
  // ---------- WAV (16-bit PCM, what the host writes; 24 / 32-bit float read too) ----------
  function encodeWav({ rate, channels }) {
    const n = channels[0]?.length || 0, c = channels.length, bytes = new Uint8Array(44 + n * c * 2), v = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, c, true); v.setUint32(24, rate, true); v.setUint32(28, rate * c * 2, true); v.setUint16(32, c * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * c * 2, true);
    let o = 44; for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { const s = Math.max(-1, Math.min(1, channels[k][i])); v.setInt16(o, Math.round(s * 32767), true); o += 2; }
    return bytes;
  }
  function decodeWav(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = o => String.fromCharCode(...bytes.subarray(o, o + 4));
    if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw Error('Not a WAV file.');
    let o = 12, fmt = null, data = null;
    while (o + 8 <= bytes.length) { const id = tag(o), size = v.getUint32(o + 4, true); if (id === 'fmt ') fmt = o + 8; if (id === 'data') { data = [o + 8, Math.min(size, bytes.length - o - 8)]; break; } o += 8 + size + (size & 1); }
    if (!fmt || !data) throw Error('This WAV has no audio.');
    const format = v.getUint16(fmt, true), c = v.getUint16(fmt + 2, true), rate = v.getUint32(fmt + 4, true), bits = v.getUint16(fmt + 14, true), step = bits / 8, n = Math.floor(data[1] / (step * c));
    if (!(format === 1 && (bits === 16 || bits === 24)) && !(format === 3 && bits === 32)) throw Error('Use a 16 / 24-bit PCM or 32-bit float WAV.');
    const channels = Array.from({ length: c }, () => new Float32Array(n));
    for (let i = 0, p = data[0]; i < n; i++) for (let k = 0; k < c; k++, p += step) channels[k][i] = bits === 16 ? v.getInt16(p, true) / 32768 : bits === 24 ? ((bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16) << 8 >> 8) / 8388608 : v.getFloat32(p, true);
    return { rate, channels };
  }
  /** The park ambience under the loop: looped (with a short crossfade at the seam) to the loop's length, mono-summed and
   *  spread to both channels, gainDb under the loop, faded in / out at the loop's ends so the loop still loops. */
  function layer(loop, amb, { gainDb = -14, fade = .02 } = {}) {
    const n = loop.channels[0].length, g = 10 ** (gainDb / 20);
    const src = resample(mono(amb.channels), amb.rate, loop.rate), m = src.length;
    const out = loop.channels.map(ch => Float32Array.from(ch));
    if (!m || !n) return { rate: loop.rate, channels: out, gainDb };
    // a seamless ambience loop: its last x samples crossfaded into its first x (x ≤ 250 ms, ≤ a quarter of it)
    const x = Math.min(Math.floor(m / 4), Math.round(loop.rate * .25)), seamless = src.slice(0, m - x);
    for (let k = 0; k < x; k++) seamless[k] = src[k] * (k / x) + src[m - x + k] * (1 - k / x);
    const len = seamless.length, f = Math.max(1, Math.round(loop.rate * fade));
    for (let i = 0; i < n; i++) {
      const s = seamless[i % len] * g * Math.min(1, i / f, (n - 1 - i) / f);
      for (const ch of out) ch[i] = Math.max(-1, Math.min(1, ch[i] + s));
    }
    return { rate: loop.rate, channels: out, gainDb };
  }
  function mono(chs) { const n = chs[0]?.length || 0, out = new Float32Array(n); for (const ch of chs) for (let i = 0; i < n; i++) out[i] += ch[i] / chs.length; return out; }
  function resample(x, from, to) {
    if (from === to || !x.length) return x;
    const n = Math.max(1, Math.round(x.length * to / from)), out = new Float32Array(n), r = from / to;
    for (let i = 0; i < n; i++) { const p = i * r, j = Math.floor(p), t = p - j; out[i] = (x[j] ?? 0) * (1 - t) + (x[Math.min(j + 1, x.length - 1)] ?? 0) * t; }
    return out;
  }
  /** Levels the way Codex's proof review measures audio (QuestReview.file's audio branch), from PCM already in hand. */
  function analyse({ rate, channels }) {
    const per = channels.map(data => { let sum = 0, peak = 0, clipped = 0; for (let j = 0; j < data.length; j++) { const v = Math.abs(data[j]); sum += v * v; if (v > peak) peak = v; if (v >= .999) clipped++; } return { sampledPeak: +peak.toFixed(5), sampledRms: +Math.sqrt(sum / Math.max(1, data.length)).toFixed(5), samplesNearFullScale: clipped, sampledCount: data.length, seamDelta: +Math.abs((data[0] || 0) - (data[data.length - 1] || 0)).toFixed(5) }; });
    return { durationSeconds: +(channels[0].length / rate).toFixed(3), sampleRate: rate, channels: per, note: 'Sampled amplitude only. Near-full-scale samples are not proof of audible clipping. Seam delta is not a listening test.' };
  }
  // ---------- MIDI (a type-0 file: tempo, time signature, the notes as they were played) ----------
  function midiFile(notes = [], { bpm = 120, beats = 4, name = 'Park jam' } = {}) {
    const ppq = 480, tick = s => Math.max(0, Math.round(s * bpm / 60 * ppq)), ev = [];
    for (const n of notes) { const on = tick(n.time), off = Math.max(on + 1, tick(n.time + n.length)), key = n.note & 127, vel = Math.max(1, Math.min(127, n.velocity | 0 || 100)); ev.push([on, 1, [0x90, key, vel]], [off, 0, [0x80, key, 0]]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const body = [], vlq = n => { const out = [n & 127]; while ((n >>= 7)) out.unshift((n & 127) | 128); return out; };
    const title = [...new TextEncoder().encode(String(name).slice(0, 100))], us = Math.round(60e6 / bpm);
    body.push(0, 0xff, 0x03, ...vlq(title.length), ...title, 0, 0xff, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255, 0, 0xff, 0x58, 4, beats, 2, 24, 8);
    let t = 0; for (const [at, , msg] of ev) { body.push(...vlq(at - t), ...msg); t = at; }
    body.push(0, 0xff, 0x2f, 0);
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ppq >> 8, ppq & 255], track = [0x4d, 0x54, 0x72, 0x6b, body.length >>> 24, body.length >> 16 & 255, body.length >> 8 & 255, body.length & 255];
    return Uint8Array.from([...head, ...track, ...body]);
  }
  // ---------- places, sketches, weeks ----------
  // "Park sketch · Belleville · 18 Oct" (parisquests61's QuestParis.sketchTitle) → "Belleville"
  const placeOf = title => (/^park sketch · (.+?) · /i.exec(String(title || '')) || [])[1] || null;
  const placeKey = name => String(name || 'outside').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outside';
  function isoWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())), day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day); const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
  }
  const stamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}.${String(date.getSeconds()).padStart(2, '0')}`;
  /** File names for one take: "Belleville loop 2026-10-18 15.04.09.wav" (+ " ambience" / " layered" / .mid / .json). */
  function takeNames(place, date = new Date()) {
    const base = `${String(place || 'Park').replace(/[^\w .·-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Park'} loop ${stamp(date)}`;
    return { loop: `${base}.wav`, layered: `${base} layered.wav`, ambience: `${base} ambience.wav`, midi: `${base}.mid`, notes: `${base}.json` };
  }
  /** The proof text for the park quest (Codex's proof contract: excerpt ≤ 20,000, analysis ≤ 6,000, coverage ≤ 600). */
  function proofText(take, analysis) {
    const notes = take.notes || [], names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const list = notes.slice(0, 64).map(n => `${names[n.note % 12]}${Math.floor(n.note / 12) - 1}@${n.time.toFixed(2)}s`).join(' ');
    const excerpt = [`Park jam loop · ${take.place || 'outside'} · ${take.bars} bars of ${take.beats || 4} at ${Math.round(take.bpm)} BPM · ${take.seconds.toFixed(1)} s`,
      `Instrument: ${take.instrument || 'Serum 2 / Vital'} · output: ${take.output || 'laptop'}${take.ambience ? ' · park ambience layered under it (10 s field recording, looped)' : ''}`,
      `${notes.length} notes played live${notes.length ? ': ' + list + (notes.length > 64 ? ' …' : '') : ''}`, take.sketch ? `Sketch: ${take.sketch}` : ''].filter(Boolean).join('\n').slice(0, 20000);
    return { excerpt, analysis: JSON.stringify({ ...analysis, notesPlayed: notes.length, bars: take.bars, bpm: take.bpm }).slice(0, 6000),
      coverage: 'Technical audio/documentation review only: the loop’s decoded duration and sampled levels, plus the notes played (from the instrument host). Astra cannot hear this audio; no claims about melody, groove, mix taste or emotional quality.'.slice(0, 600) };
  }
  return { UA, BUILTIN, BLUETOOTH, hasUA, parkOutput, safeBuffer, batterySaver, lowestChoice, BARS, loopSeconds, loopArgs, encodeWav, decodeWav, layer, mono, resample, analyse, midiFile, placeOf, placeKey, isoWeek, stamp, takeNames, proofText };
});
