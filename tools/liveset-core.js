/* (round 64, liveset64) Live set for an open mic: the thinking, with no DOM and no runtime (Node tests require it:
   dev/liveset64-test.js). The set model (scenes of pads: clips from park takes / a song's mixdown, presets from the bank),
   the keys that play it, the bar grid (identical to creative-vst-liveset.py's: the host does the real timing, the window
   only draws it), the one-knob filter, when a preset can switch (preloaded: the next beat; not yet: the first beat after
   its load), which preset to preload next, how a take fits the scene's tempo, the bar counter, and the proof text for the
   open-mic quest. tools/liveset.js is the view; the host part is creative-vst-liveset.py. */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.LiveSetCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const CLIP_KEYS = '1234567890', PRESET_KEYS = 'qwertyuiop';
  const MAX_SCENES = 12, MAX_CLIPS = 10, MAX_PRESETS = 10, MAX_RUNS = 12;
  const STRETCH = [0.8, 1.25]; // the same range loopsong63 stretches in (WSOLA, pitch kept)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const uid = p => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const text = (v, n, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);

  // ---------- the set: { v, name, instrument, quantize, scenes: [{ id, name, bpm, beats, pads }], runs } ----------
  function scene({ name = 'Song 1', bpm = 120, beats = 4 } = {}) { return { id: uid('scene'), name: text(name, 60, 'Song'), bpm: clamp(num(bpm, 120), 40, 240), beats: clamp(Math.round(num(beats, 4)), 2, 7), pads: [] }; }
  function create({ name = 'Open mic set', instrument = 'Vital', bpm = 120, beats = 4 } = {}) {
    return { v: 1, name: text(name, 60, 'Open mic set'), instrument: instrument === 'Serum 2' ? 'Serum 2' : 'Vital', quantize: 'bar', scenes: [scene({ name: 'Song 1', bpm, beats })], runs: [] };
  }
  function fixPad(p) {
    if (!p || typeof p !== 'object' || !['clip', 'preset'].includes(p.kind)) return null;
    const pad = { id: text(p.id, 64, uid('pad')), kind: p.kind, label: text(p.label, 60, p.kind === 'clip' ? 'Clip' : 'Preset'), fx: clamp(num(p.fx, 0), -1, 1) };
    if (p.kind === 'clip') {
      Object.assign(pad, { loop: p.loop !== false, gainDb: clamp(num(p.gainDb, 0), -60, 12), bars: clamp(Math.round(num(p.bars, 4)), 1, 512), source: p.source && typeof p.source === 'object' ? { type: p.source.type === 'song' ? 'song' : 'take', file: text(p.source.file, 2000), bpm: num(p.source.bpm, null), sketch: text(p.source.sketch, 160), place: text(p.source.place, 60) } : null });
      if (typeof p.file === 'string' && p.file.length < 2000) pad.file = p.file;
      if (p.prepared && Number.isFinite(p.prepared.bpm)) pad.prepared = { bpm: p.prepared.bpm, ratio: num(p.prepared.ratio, 1), warn: text(p.prepared.warn, 300) };
    } else {
      pad.preset = { label: text(p.preset?.label, 100), id: text(p.preset?.id, 120) || null, from: p.preset?.from === 'soundbank' ? 'soundbank' : 'bank' };
      pad.instrument = p.instrument === 'Serum 2' ? 'Serum 2' : 'Vital';
    }
    return pad;
  }
  function validate(raw) {
    if (!raw || raw.v !== 1 || !Array.isArray(raw.scenes)) return create();
    const set = create({ name: raw.name, instrument: raw.instrument });
    set.quantize = ['bar', 'beat', 'now'].includes(raw.quantize) ? raw.quantize : 'bar';
    set.scenes = raw.scenes.slice(0, MAX_SCENES).map(s => { const x = scene(s); x.id = text(s?.id, 64, x.id); x.pads = (Array.isArray(s?.pads) ? s.pads : []).map(fixPad).filter(Boolean); return x; });
    if (!set.scenes.length) set.scenes = [scene()];
    for (const s of set.scenes) { const c = s.pads.filter(p => p.kind === 'clip').slice(0, MAX_CLIPS), q = s.pads.filter(p => p.kind === 'preset').slice(0, MAX_PRESETS); s.pads = [...c, ...q]; }
    set.runs = (Array.isArray(raw.runs) ? raw.runs : []).filter(r => r && typeof r.path === 'string').slice(0, MAX_RUNS);
    return set;
  }
  const clips = s => s.pads.filter(p => p.kind === 'clip');
  const presets = s => s.pads.filter(p => p.kind === 'preset');
  function addScene(set, opts = {}) { if (set.scenes.length >= MAX_SCENES) throw Error(`A set holds up to ${MAX_SCENES} songs.`); const last = set.scenes.at(-1); const s = scene({ name: `Song ${set.scenes.length + 1}`, bpm: last?.bpm, beats: last?.beats, ...opts }); set.scenes.push(s); return s; }
  function addPad(set, sceneIx, raw) {
    const s = set.scenes[sceneIx]; if (!s) throw Error('No such song in the set.');
    const pad = fixPad({ ...raw, id: uid('pad') }); if (!pad) throw Error('Not a pad.');
    if (pad.kind === 'clip' && clips(s).length >= MAX_CLIPS) throw Error(`A song holds up to ${MAX_CLIPS} clip pads (keys ${CLIP_KEYS.split('').join(' ')}).`);
    if (pad.kind === 'preset' && presets(s).length >= MAX_PRESETS) throw Error(`A song holds up to ${MAX_PRESETS} preset pads (keys ${PRESET_KEYS.toUpperCase().split('').join(' ')}).`);
    if (pad.kind === 'preset' && pad.instrument !== set.instrument) throw Error(`This set plays ${set.instrument}; that preset is for ${pad.instrument}.`);
    s.pads = pad.kind === 'clip' ? [...clips(s), pad, ...presets(s)] : [...clips(s), ...presets(s), pad];
    return pad;
  }
  function removePad(set, sceneIx, ref) { const s = set.scenes[sceneIx], p = findPad(s, ref); s.pads.splice(s.pads.indexOf(p), 1); return p; }
  // a pad by its key ("3", "w"), its number in the song ("4"), its id or the start of its label
  function findPad(s, ref) {
    const r = String(ref ?? '').trim().toLowerCase(); if (!s || !r) throw Error('Which pad? Its key (1–0, Q–P) or its name.');
    const p = padForKey(s, r) || s.pads.find(x => x.id === ref) || s.pads.find(x => x.label.toLowerCase() === r) || s.pads.find(x => x.label.toLowerCase().startsWith(r));
    if (!p) throw Error(`No pad “${ref}” in ${s.name}.`); return p;
  }
  function keyOf(s, pad) { const c = clips(s).indexOf(pad); if (c >= 0) return CLIP_KEYS[c]; const q = presets(s).indexOf(pad); return q >= 0 ? PRESET_KEYS[q] : ''; }
  function padForKey(s, key) { const k = String(key || '').toLowerCase(); if (k.length !== 1) return null; const c = CLIP_KEYS.indexOf(k); if (c >= 0) return clips(s)[c] || null; const q = PRESET_KEYS.indexOf(k); return q >= 0 ? presets(s)[q] || null : null; }

  // ---------- the keys (the view registers them with Keys.add; nothing here needs a mouse) ----------
  const KEYMAP = [
    ['1 … 0', 'launch / stop clip pad 1–10 (on the next bar)'], ['Q … P', 'switch to preset pad 1–10 (on the next beat, preloaded)'],
    ['Enter', 'launch every clip of this song together'], ['Space', 'stop the clips at the next bar'], ['Esc', 'panic: everything fades out (300 ms)'],
    ['↑ ↓', 'previous / next song in the set'], ['← →', 'select a pad'], [', .', 'turn the selected pad\'s knob (filter) down / up'], ['/', 'knob back to the middle (filter off)'],
    ['[ ]', 'tempo −1 / +1 BPM (when no loop plays)'], ['\\', 'stage on / off (hide everything else)'], ['Ctrl+Enter', 'Rehearse: start / stop recording the run'], ['Ctrl+Shift+Enter', 'Perform: start / stop recording the show']
  ];
  function action(e, { typing = false } = {}) { // a keydown → what it means in the set (null = not ours)
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === 'Enter' && mod) return { do: e.shiftKey ? 'perform' : 'rehearse' };
    if (typing || e.altKey || mod) return null;
    if (k === 'Escape') return { do: 'panic' };
    if (k === 'Enter') return { do: 'scene' };
    if (k === ' ') return { do: 'stop' };
    if (k === 'ArrowUp' || k === 'ArrowDown') return { do: 'go', by: k === 'ArrowUp' ? -1 : 1 };
    if (k === 'ArrowLeft' || k === 'ArrowRight') return { do: 'select', by: k === 'ArrowLeft' ? -1 : 1 };
    if (k === ',' || k === '.') return { do: 'knob', by: k === ',' ? -0.1 : 0.1 };
    if (k === '/') return { do: 'knob', to: 0 };
    if (k === '[' || k === ']') return { do: 'tempo', by: k === '[' ? -1 : 1 };
    if (k === '\\') return { do: 'stage' };
    const l = k.length === 1 ? k.toLowerCase() : '';
    if (l && CLIP_KEYS.includes(l)) return { do: 'pad', key: l };
    if (l && PRESET_KEYS.includes(l)) return { do: 'pad', key: l };
    return null;
  }

  // ---------- the bar grid (the host's own math, kept identical: creative-vst-liveset.py boundary / where) ----------
  const spb = t => 60 / t.bpm * t.rate;
  function boundary(t, sample, unit = 'bar') {
    if (unit === 'now') return sample;
    const step = spb(t) * (unit === 'bar' ? t.beats : 1), k = Math.ceil((sample - t.origin) / step - 1e-9);
    return Math.round(t.origin + Math.max(0, k) * step);
  }
  function where(t, sample) { const beats = (sample - t.origin) / spb(t); return { bar: Math.floor(beats / t.beats) + 1, beat: Math.floor(((beats % t.beats) + t.beats) % t.beats) + 1, phase: beats - Math.floor(beats) }; }
  // the tempo moves, the beat we're on doesn't (the host re-anchors the same way)
  function retempo(t, sample, bpm) { const beat = (sample - t.origin) / spb(t); const n = { ...t, bpm }; n.origin = Math.round(sample - beat * spb(n)); return n; }
  // what the audience hears now, from the host's last status (the render position minus the output latency) and the
  // time since it arrived: the window's bar counter is drawn from this, never from its own clock
  function audible(status, sinceMs) { return status.position - (status.latencyMs || 0) / 1000 * status.rate + Math.max(0, sinceMs) / 1000 * status.rate; }
  function counter(status, sinceMs) { const w = where(status, audible(status, sinceMs)); return { ...w, text: w.bar < 1 ? 'Count-in' : `Bar ${w.bar} · ${w.beat}/${status.beats}`, msToBeat: (1 - w.phase) * 60000 / status.bpm }; }

  // ---------- the one knob: left = low-pass, right = high-pass, middle = off (same curve as the host's fx_filter) ----------
  function fxFilter(fx) {
    const v = clamp(num(fx, 0), -1, 1); if (Math.abs(v) < 0.02) return { kind: null, hz: 0 };
    return v < 0 ? { kind: 'low', hz: 20000 * (150 / 20000) ** -v } : { kind: 'high', hz: 30 * (6000 / 30) ** v };
  }
  function fxLabel(fx) { const f = fxFilter(fx); if (!f.kind) return 'Filter off'; const hz = f.hz >= 1000 ? `${(f.hz / 1000).toFixed(1)} kHz` : `${Math.round(f.hz)} Hz`; return `${f.kind === 'low' ? 'Low-pass' : 'High-pass'} ${hz}`; }

  // ---------- presets: preload, then switch on the beat ----------
  // ready: the twin already holds this preset → the next beat (or bar) line. Not ready: preload first (loadMs, measured
  // by the host on the last load; 400 ms the first time) and switch on the first line after it can be ready + a margin.
  function switchPlan({ transport, now, ready, loadMs = 400, unit = 'beat', marginMs = 30 }) {
    const earliest = ready ? now : now + Math.round((Math.max(0, loadMs) + marginMs) / 1000 * transport.rate);
    const at = boundary(transport, earliest, unit);
    return { preload: !ready, at, ...where(transport, at), waitMs: Math.round((at - now) / transport.rate * 1000) };
  }
  // the preset to keep in the twin: the next preset pad after the one playing (this song, then the next songs), so
  // pressing on through the set is always instant; going back to the previous preset is instant too (the host keeps it)
  function nextPreset(set, sceneIx, currentId) {
    const order = []; for (let i = 0; i < set.scenes.length; i++) for (const p of presets(set.scenes[(sceneIx + i) % set.scenes.length])) order.push(p);
    if (!order.length) return null;
    const i = order.findIndex(p => p.id === currentId); if (i < 0) return order[0];
    return order.slice(i + 1).find(p => p.id !== currentId) || null;
  }

  // ---------- clips: how a take fits the song's tempo ----------
  function fit(take, s) {
    const tb = num(take?.bpm, s.bpm), ratio = s.bpm / tb;
    if (Math.abs(ratio - 1) < 1e-3) return { ratio: 1, stretch: false, warn: '' };
    if (ratio >= STRETCH[0] && ratio <= STRETCH[1]) return { ratio, stretch: true, warn: '' };
    return { ratio, stretch: false, warn: `${take.place || 'This take'} is at ${Math.round(tb)} BPM in a ${Math.round(s.bpm)} BPM song: too far to stretch cleanly, so it plays at its own tempo (it drifts against the bars).` };
  }
  const loopFrames = (bars, s, rate) => Math.round(bars * s.beats * 60 / s.bpm * rate);
  const needsPrepare = (pad, s) => pad.kind === 'clip' && (!pad.file || !pad.prepared || Math.abs(pad.prepared.bpm - s.bpm) > 1e-6);

  // ---------- runs and the open-mic quest ----------
  const OPENMIC = 'openmic', PLAY_STEP = ['Play your set', 'Rehearse your short set all the way through in Hearth’s Live set, or play it at the open mic. The recording of the run is the proof; nerves and wrong notes are part of it.', 'Rehearse once with the stage view on.', 15, 40];
  // which steps of “Go to an open mic” a run can prove: a rehearsal → “Decide your own next step” (it IS what you could
  // bring next time) and “Play your set”; a performance also proves “Go and watch the whole thing” (you were there)
  function fits(stepIndex, kind) { return kind === 'Performance' ? stepIndex >= 1 : stepIndex >= 2; }
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function runSummary(run) {
    const ev = run.events || [], launches = ev.filter(e => e.kind === 'launch').length, switches = ev.filter(e => e.kind === 'switch').length, panics = ev.filter(e => e.kind === 'panic').length;
    return `${run.kind} · ${clock(run.seconds || 0)} · ${run.bars || 0} bars · ${launches} launch${launches === 1 ? '' : 'es'} · ${switches} preset switch${switches === 1 ? '' : 'es'}${panics ? ` · ${panics} panic` : ''}`;
  }
  function proofText(run, set) {
    const ev = (run.events || []).slice(0, 120).map(e => `bar ${e.bar}.${e.beat} ${e.kind}${e.slot ? ' ' + (run.labels?.[e.slot] || e.slot) : ''}${e.id ? ' ' + (run.labels?.[e.id] || e.id) : ''}${e.bpm ? ' ' + e.bpm + ' BPM' : ''}`).join(' · ');
    const excerpt = [`Live set run · “${set.name}” · ${runSummary(run)}`, `Instrument: ${set.instrument} · songs: ${set.scenes.map(s => `${s.name} (${Math.round(s.bpm)} BPM, ${s.pads.length} pads)`).join(', ')}`,
      `What happened, on the bar grid: ${ev || 'no pad pressed (played live on the controller)'}`].join('\n').slice(0, 20000);
    const analysis = JSON.stringify({ kind: run.kind, seconds: +(run.seconds || 0).toFixed(1), bars: run.bars, peak: run.peak, silent: !!run.silent, levelsDb10s: (run.levels || []).slice(0, 120), dropped: run.dropped || 0, underruns: run.underruns ?? null, events: (run.events || []).length }).slice(0, 6000);
    return { excerpt, analysis, coverage: 'Technical review only: the run’s duration, its levels every 10 s and the log of pad launches / preset switches from the instrument host. Astra cannot hear this audio; no claims about the performance’s musical quality.'.slice(0, 600) };
  }
  return { CLIP_KEYS, PRESET_KEYS, MAX_SCENES, MAX_CLIPS, MAX_PRESETS, MAX_RUNS, STRETCH, KEYMAP, create, scene, validate, fixPad, clips, presets, addScene, addPad, removePad, findPad, keyOf, padForKey, action, spb, boundary, where, retempo, audible, counter, fxFilter, fxLabel, switchPlan, nextPreset, fit, loopFrames, needsPrepare, OPENMIC, PLAY_STEP, fits, clock, runSummary, proofText };
});
