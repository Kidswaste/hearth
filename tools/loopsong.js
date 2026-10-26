// (round 63, loopsong63) From park loops to a song. The owner records loops in the park (parkjam62: each take's dry /
// layered / ambience WAV, MIDI and notes JSON in <data>/creative-park/<sketch>/); this lays them out as a song inside
// Codex's Sound desk: one "Arrange" button in the Park jam fold (no new row) opens a panel over the desk, /song from
// any chat opens it too.
//   Takes from ANY park sketch (main lists them: hub.parkSong.list), four lanes + a re-render lane, clips snap to bars,
//   the song's tempo comes from the takes (another tempo is stretched with the pitch kept, or plays at its own tempo
//   with a warning), repeat / trim (whole beats) / fades / gain, the park ambience on or off per clip.
//   Re-render: a take's MIDI played through Serum 2 / Vital LIVE with another preset (vstlive61's WorkbenchVST.api:
//   loadPreset, then the host's sequencer + parkjam62's loop recorder; the owner's own sound comes back after).
//   Playback: the window's Web Audio graph (the instrument host is never involved). Export: the mix normalized to −1 dBFS,
//   one stem per lane (same gain: they add up to the mix), the song's MIDI and its JSON, an MP3 when ffmpeg is there —
//   all in the sketch's folder, each written atomically (parkSave: .part, then renamed).
//   Proof: the exported song is offered to the "Finish a track" personal quest (added when missing; review stays yours).
// Nothing runs while it's closed or paused: no timers, no AudioContext; one timer only while playing.
// The pure parts are in tools/loopsong-core.js (dev/loopsong63-test.js); app check: dev/checks/loopsong63.js.
const LoopSong = (() => {
  const S = LoopSongCore, P = ParkJamCore, wait = ms => new Promise(r => setTimeout(r, ms));
  let h = null, view = null, selected = null, takes = [], player = null, ffmpeg = null, epoch = 0;
  const cache = new Map(); // source key → { rate, channels } (decoded, resampled, stretched): at most 16 kept
  const A = () => WorkbenchVST.api;
  const BAR_PX = 28, LANE_PX = 34;
  const checked = new WeakSet(); // songs read back from the project once (S.validate), then edited in place
  function song() {
    if (!h?.state) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (!h.state.song || h.state.song.v !== 1) h.state.song = S.create({ title: `${P.placeOf(sketch()) || 'Park'} song`, sketch: sketch() });
    else if (!checked.has(h.state.song)) h.state.song = S.validate(h.state.song);
    checked.add(h.state.song); return h.state.song;
  }
  const sketch = () => { try { return WorkbenchUI.snapshot().title || 'Park sketch'; } catch { return 'Park sketch'; } };
  const save = () => h.persist();
  let said = ''; // the status line survives a redraw
  const say = text => { said = text; h?.say?.(text); const o = view?.querySelector('.ls-status'); if (o && o.textContent !== text) o.textContent = text; return text; };

  // ---------- the desk (the song lives in the Sound desk's project: state.vst.song) ----------
  const here = () => !!document.querySelector('.wb-sound-desk')?.checkVisibility?.({ visibilityProperty: true });
  async function desk() {
    if (!here()) { activate('tool:creative'); CreativePlayground.openFeature('vst'); }
    for (let i = 0; i < 300 && !(here() && ParkJam.helpers()); i++) await wait(50);
    h = ParkJam.helpers() || h; if (!h || !here()) throw Error('Open Creative Playground → Serum 2 / Vital first.');
  }
  async function loadTakes() {
    const r = await hub.parkSong?.list?.().catch(() => null), seen = new Set(), list = [];
    for (const t of [...(h?.state?.park?.takes || []), ...(r?.takes || [])]) { const k = t.loop; if (!k || seen.has(k)) continue; seen.add(k); list.push(t); }
    takes = list; return list;
  }
  const takeLabel = (t, i) => `${i + 1}. ${t.place || 'Park'} · ${t.bars} bars · ${Math.round(t.bpm)} BPM · ${t.notes ?? 0} notes${t.layered ? ' · + ambience' : ''} · ${String(t.at || '').slice(5, 16).replace('T', ' ')}`;

  // ---------- the panel (over the desk; one per desk mount) ----------
  async function open(helpers) {
    if (helpers) h = helpers; await desk(); const mine = ++epoch;
    await loadTakes(); if (mine !== epoch) return;
    if (ffmpeg === null) ffmpeg = await hub.ffmpegStatus?.().then(s => !!s?.ffmpeg).catch(() => false);
    const host = document.querySelector('.wb-sound-desk'); if (!host) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    view?.remove(); view = h.e('section', null, 'ls-view'); view.setAttribute('role', 'dialog'); view.setAttribute('aria-label', 'Arrange park loops into a song');
    host.append(view); draw(); view.scrollIntoView({ block: 'start' }); view.querySelector('.ls-close')?.focus({ preventScroll: true });
    return say(takes.length ? `Arrange: ${takes.length} park take${takes.length === 1 ? '' : 's'} to pick from.` : 'No park takes yet: Park jam · capture the moment → Record loop.');
  }
  function close() { stop(); epoch++; view?.remove(); view = null; selected = null; }
  function pause() { close(); cache.clear(); } // the desk is leaving (ParkJam.pause)
  function draw() {
    if (!view) return; const s = song(), { e, btn, select, check } = h; view.replaceChildren();
    const head = e('div', null, 'ls-head');
    head.append(e('strong', `Arrange · ${s.title}`), e('output', s.bpm ? `${Math.round(s.bpm * 10) / 10} BPM · ${s.beats}/4 · ${S.bars(s)} bars · ${S.duration(s).toFixed(1)} s` : 'Tempo comes from the first take', 'ls-meta'));
    const playB = btn(player ? '■ Stop' : '▶ Play', async () => { if (player) stop(); else await play(); }, 'ls-play');
    const exp = btn('Export', async () => { const x = await exportSong({ mp3: s.mp3 !== false }); say(`Exported ${x.seconds.toFixed(1)} s: mix + ${x.stems.length} stem${x.stems.length === 1 ? '' : 's'} + MIDI${x.mp3 ? ' + MP3' : ''} in “${s.sketch}”.`); draw(); });
    const closeB = btn('✕', () => close(), 'ls-close'); closeB.setAttribute('aria-label', 'Close Arrange');
    const daw = btn('📤 Send to my DAW', () => Lazy.load('dawsend').then(() => DawSend.open(h, { source: 'arrange' })).then(say), 'ls-daw'); daw.title = 'Stems per lane at bar 1, the mix, MIDI and presets for Ableton / FL / Logic, in a folder you choose'; // (round 69, stems69)
    head.append(playB, exp, daw, closeB); view.append(head);
    // pick: a take (any park sketch) → a lane
    const pick = h.e('div', null, 'wb-row ls-pick'); let tk = 0, ln = 0;
    pick.append(select('Take', '0', takes.length ? takes.map((t, i) => [String(i), takeLabel(t, i)]) : [['0', 'No park takes yet']], v => { tk = Number(v); }),
      select('Lane', '0', s.lanes.map((l, i) => [String(i), l.name]), v => { ln = Number(v); }),
      btn('Add', async () => { const t = takes[tk]; if (!t) throw Error('Record a park loop first.'); const c = S.addClip(s, t, { lane: ln }); selected = c.id; await save(); draw(); say(`Added on ${s.lanes[c.lane].name} at bar ${c.start + 1}${s.clips.length === 1 ? ` · the song is at ${Math.round(s.bpm)} BPM (from the take)` : ''}.`); }));
    if (ffmpeg) pick.append(check('MP3 too', s.mp3 !== false, v => { s.mp3 = v; }));
    view.append(pick);
    // the lanes over bars
    const total = Math.max(16, S.bars(s) + 4), grid = e('div', null, 'ls-grid'); grid.style.setProperty('--bars', total); grid.style.setProperty('--bar', BAR_PX + 'px');
    const ruler = e('div', null, 'ls-ruler'); for (let b = 0; b < total; b += 4) { const m = e('span', String(b + 1)); m.style.left = (b * BAR_PX) + 'px'; ruler.append(m); } grid.append(ruler);
    s.lanes.forEach((lane, i) => {
      const r = e('div', null, 'ls-lane' + (lane.rerender ? ' ls-rerender' : '')), name = e('div', null, 'ls-lane-name');
      const mute = btn('M', async () => { lane.mute = !lane.mute; player?.mute(i, lane.mute); await save(); draw(); }, 'ls-mute'); mute.setAttribute('aria-pressed', String(lane.mute)); mute.setAttribute('aria-label', `Mute ${lane.name}`);
      name.append(e('span', lane.rerender ? '↻ Re-render' : lane.name), mute); r.append(name);
      const track = e('div', null, 'ls-track'); track.dataset.lane = i; r.append(track); grid.append(r);
      for (const c of s.clips.filter(x => x.lane === i)) track.append(clipEl(s, c));
    });
    const head2 = e('div', null, 'ls-playhead'); grid.append(head2); view.append(grid);
    // the selected clip's details, the warnings, the last export
    const c = s.clips.find(x => x.id === selected); if (c) view.append(inspector(s, c));
    const warn = S.warnings(s); if (warn.length) view.append(e('p', '⚠ ' + warn.join(' '), 'wb-note ls-warn'));
    const last = s.exports[0];
    if (last) { const r = h.e('div', null, 'wb-row ls-last'); r.append(e('span', `Last export · ${last.seconds.toFixed(1)} s · ${String(last.at).slice(0, 16).replace('T', ' ')}${last.proof ? ` · ✓ proof for “${last.proof.step}”` : ''}`), btn('Show file', () => hub.fs.reveal(last.mix))); if (!last.proof) r.append(btn('Offer as “Finish a track” proof', async () => { say(await offer()); draw(); })); view.append(r); }
    view.append(e('output', said, 'wb-note ls-status'));
  }
  function clipEl(s, c) {
    const sp = S.span(s, c), b = h.e('button', null, 'ls-clip' + (c.id === selected ? ' ls-on' : '') + (c.lane === S.RERENDER && !c.rerender ? ' ls-empty' : ''));
    b.type = 'button'; b.dataset.clip = c.id; b.style.left = (c.start * BAR_PX) + 'px'; b.style.width = Math.max(10, sp.bars * BAR_PX - 2) + 'px';
    b.textContent = `${c.take.place || 'Take'} ${c.take.bars}b${c.repeat > 1 ? ' ×' + c.repeat : ''}${c.rerender ? ' ↻ ' + (c.rerender.preset || 'synth') : ''}${c.take.layered && !c.ambience ? ' · dry' : ''}`;
    b.title = `${c.take.sketch} · bar ${c.start + 1} · ${sp.bars.toFixed(2)} bars (drag to move; arrow keys: a bar / a lane)`;
    b.onclick = () => { selected = c.id; draw(); view?.querySelector(`[data-clip="${c.id}"]`)?.focus({ preventScroll: true }); };
    b.onkeydown = ev => { const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key]; if (!d) return; ev.preventDefault(); S.move(s, c.id, { lane: c.lane + d[0], bar: c.start + d[1] }); selected = c.id; save(); draw(); view?.querySelector(`[data-clip="${c.id}"]`)?.focus({ preventScroll: true }); };
    // drag: snapped to bars (and lanes) on release; only this element's transform moves meanwhile
    b.onpointerdown = ev => {
      if (ev.button !== 0) return; const x0 = ev.clientX, y0 = ev.clientY; let moved = false; try { b.setPointerCapture(ev.pointerId); } catch { /* a synthetic pointer */ }
      b.onpointermove = m => { const dx = m.clientX - x0, dy = m.clientY - y0; if (!moved && Math.hypot(dx, dy) < 4) return; moved = true; b.style.transform = `translate(${Math.round(dx / BAR_PX) * BAR_PX}px, ${Math.round(dy / LANE_PX) * LANE_PX}px)`; };
      b.onpointerup = m => { b.onpointermove = b.onpointerup = null; if (!moved) return; b.style.transform = ''; S.move(s, c.id, { bar: c.start + Math.round((m.clientX - x0) / BAR_PX), lane: c.lane + Math.round((m.clientY - y0) / LANE_PX) }); selected = c.id; save(); stop(); draw(); };
    };
    return b;
  }
  function inspector(s, c) {
    const { e, row, field, check, btn, select } = h, box = e('div', null, 'ls-inspect'), total = c.take.bars * c.take.beats, plan = S.tempoPlan(s, c);
    const num = (label, v, set) => field(label, v, x => { set(Number(x)); save().then(draw); }, 'number');
    box.append(e('strong', `${c.take.place || 'Take'} · ${c.take.bars} bars at ${Math.round(c.take.bpm)} BPM · from “${c.take.sketch}”`));
    box.append(row(num('Bar', c.start + 1, v => S.move(s, c.id, { bar: v - 1 })), num('Repeat', c.repeat, v => S.repeat(s, c.id, v)),
      num(`Trim in (beat of ${total})`, c.in, v => S.trim(c, v, c.out)), num('Trim out (beat)', c.out, v => S.trim(c, c.in, v)),
      num('Fade in (s)', c.fadeIn, v => S.fade(s, c.id, { fadeIn: v })), num('Fade out (s)', c.fadeOut, v => S.fade(s, c.id, { fadeOut: v })), num('Gain (dB)', c.gain, v => { c.gain = Math.max(-24, Math.min(6, v || 0)); })));
    const opts = row();
    if (c.take.layered) opts.append(check('Park ambience', c.ambience, v => { c.ambience = v; stop(); draw(); }));
    if (plan.ratio !== 1) opts.append(check(`Fit to ${Math.round(s.bpm)} BPM (stretch)`, c.stretch, v => { c.stretch = v; stop(); draw(); }));
    if (c.lane === S.RERENDER) {
      let presets = []; try { presets = A().current()?.ready ? A().presets() : []; } catch { presets = []; }
      opts.append(select('Preset', c.preset || '', [['', `${A().current()?.name || 'Synth'}: the sound as it is now`], ...presets.map(p => [p.label, p.label])], v => { c.preset = v || null; }),
        btn(c.rerender ? 'Re-render again' : 'Re-render', async () => { const r = await rerender(c.id); say(`Re-rendered through ${r.instrument}${r.preset ? ` with “${r.preset}”` : ''}: ${c.take.bars} bars, ${r.notes} notes. Your own sound is back.`); draw(); }));
    }
    opts.append(btn('Remove', async () => { S.remove(s, c.id); selected = null; stop(); await save(); draw(); }));
    box.append(opts); return box;
  }

  // ---------- sources: decoded, at the song's rate, stretched when the tempo needs it ----------
  async function sourceFor(s, c) {
    const src = S.sourceOf(s, c); if (!src) return null;
    if (cache.has(src.key)) { const v = cache.get(src.key); cache.delete(src.key); cache.set(src.key, v); return v; }
    const bytes = await hub.fs.read(src.file, { encoding: 'buffer', maxBytes: 120 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null);
    if (!bytes?.length) throw Error(`A take's file is gone: ${src.file.split(/[\\/]/).pop()}`);
    await wait(0); const v = S.prepare(P.decodeWav(bytes), { rate: s.rate, ratio: src.ratio });
    cache.set(src.key, v); while (cache.size > 16) cache.delete(cache.keys().next().value);
    return v;
  }
  async function sources(s) { const out = {}; for (const c of s.clips) { const v = await sourceFor(s, c); if (v) out[c.id] = v; await wait(0); } return out; }

  // ---------- playback: the window's Web Audio graph ----------
  async function play() {
    stop(); const s = song(), segs = S.schedule(s); if (!segs.length) throw Error('Add a take first.');
    const src = await sources(s), ctx = new AudioContext({ sampleRate: s.rate, latencyHint: 'playback' }), master = ctx.createGain(), t0 = ctx.currentTime + .08;
    master.connect(ctx.destination);
    const lanes = s.lanes.map(l => { const g = ctx.createGain(); g.gain.value = l.mute ? 0 : 10 ** ((l.gain || 0) / 20); g.connect(master); return g; });
    const buffers = new Map(), nodes = [];
    for (const seg of segs) {
      const p = src[seg.clip]; if (!p) continue;
      let buf = buffers.get(seg.clip); if (!buf) { buf = ctx.createBuffer(2, p.channels[0].length, p.rate); buf.copyToChannel(p.channels[0], 0); buf.copyToChannel(p.channels[1], 1); buffers.set(seg.clip, buf); }
      const n = ctx.createBufferSource(), g = ctx.createGain(), dur = Math.min(seg.dur, Math.max(0, buf.duration - seg.offset)); if (dur <= 0) continue;
      const pts = Math.max(2, Math.ceil(dur * 200)), curve = new Float32Array(pts); for (let i = 0; i < pts; i++) curve[i] = seg.gain * S.envelope(seg, i / (pts - 1) * dur);
      g.gain.value = curve[0]; g.gain.setValueCurveAtTime(curve, t0 + seg.at, dur);
      n.buffer = buf; n.connect(g).connect(lanes[seg.lane]); n.start(t0 + seg.at, seg.offset, dur); nodes.push(n);
    }
    const total = S.duration(s), ph = view?.querySelector('.ls-playhead');
    const anim = ph?.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${total / (s.beats * 60 / s.bpm) * BAR_PX}px)` }], { duration: total * 1000, delay: 80, easing: 'linear', fill: 'none' });
    const done = setTimeout(stop, (total + .3) * 1000);
    player = { ctx, nodes, anim, done, mute: (i, m) => lanes[i]?.gain.setTargetAtTime(m ? 0 : 10 ** ((s.lanes[i].gain || 0) / 20), ctx.currentTime, .01) };
    const b = view?.querySelector('.ls-play'); if (b) b.textContent = '■ Stop';
    return say(`Playing ${total.toFixed(1)} s (${S.bars(s)} bars at ${Math.round(s.bpm)} BPM).`);
  }
  function stop() {
    if (!player) return; const p = player; player = null; clearTimeout(p.done); p.anim?.cancel();
    for (const n of p.nodes) { try { n.stop(); } catch { /* not started */ } } p.ctx.close().catch(() => {});
    const b = view?.querySelector('.ls-play'); if (b && b.textContent !== '▶ Play') b.textContent = '▶ Play';
  }

  // ---------- re-render: a take's MIDI through Serum 2 / Vital, live, with another preset ----------
  async function notesOf(c) {
    try { const raw = await hub.fs.read(c.take.notesFile); return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)).notesPlayed || []; } catch { return []; }
  }
  async function req(action, extra = {}) { const c = A().current(); if (!c) throw Error('Open Serum 2 or Vital in the Sound desk first.'); const r = await hub.vst.request({ action, plugin: c.path, name: c.name, ...extra }); if (!r.ok) throw Error(r.error); return r; }
  let rendering = false;
  async function rerender(id, { preset, instrument } = {}) {
    if (rendering) throw Error('A re-render is already playing.');
    const s = song(), c = S.find(s, id), t = c.take, total = t.bars * t.beats * 60 / t.bpm;
    if (![1, 2, 4, 8, 16].includes(t.bars) || total > 64) throw Error('Re-render takes loops of 1–16 bars up to 64 seconds.');
    const { lead, notes } = S.rerenderNotes(t, await notesOf(c)); if (!notes.length) throw Error('That take has no notes to play (its notes file is empty or gone).');
    await desk(); stop(); rendering = true; let restore = false;
    try {
      for (let i = 0; i < 300 && !A().instruments().length; i++) await wait(50); // the desk's plugin scan
      const want = instrument || c.rerender?.instrument || A().current()?.name || t.instrument || 'Vital';
      if (A().current()?.name !== want) { if (!A().instruments().includes(want)) throw Error(`${want} isn't in the Sound desk.`); await A().open(want, { live: true }); }
      for (let i = 0; i < 400 && !A().current()?.ready; i++) await wait(50);
      const label = preset !== undefined ? preset : c.preset || null;
      if (label) { if (!A().presets().some(p => p.label === label)) throw Error(`No bank preset “${label}” for ${want}.`); await A().loadPreset(label); restore = true; }
      if (!A().current().live) await A().start();
      await req('record', { bars: t.bars, beats: t.beats, bpm: t.bpm, wait: 'note' });
      await req('sequence', { sequence: notes, loop: 0 });
      let st; const end = performance.now() + (total + 15) * 1000;
      for (;;) { await wait(150); st = await req('record-status'); progress(st); if (st.done) break; if (!st.recording) throw Error(st.note || 'The re-render stopped before it was finished.'); if (performance.now() > end) throw Error('The re-render took too long.'); }
      const take = await req('record-take'), pcm = P.decodeWav(take.wav instanceof Uint8Array ? take.wav : new Uint8Array(take.wav));
      const aligned = S.realign(pcm, lead, Math.round(total * pcm.rate));
      const name = `${t.place || 'Park'} rerender ${S.stamp()} ${String(label || 'as is').replace(/[^\w .-]+/g, ' ').trim().slice(0, 20)}.wav`.replace(/\s+/g, ' ');
      const r = await hub.vst.parkSave(s.sketch || t.sketch, name, P.encodeWav(aligned)); if (!r?.ok) throw Error(r?.error || 'Could not save the re-render.');
      c.rerender = { file: r.path, preset: label || '', instrument: want, at: new Date().toISOString() }; await save();
      return { file: r.path, preset: label, instrument: want, notes: notes.length, peak: take.peak };
    } catch (err) { req('record-cancel').catch(() => {}); req('sequence', { sequence: [] }).catch(() => {}); throw err; }
    finally { rendering = false; if (restore) await A().undo().catch(() => {}); } // the owner's own sound comes back
  }
  function progress(st) { const t = st.armed ? 'Re-render: starting on the first note…' : st.done ? 'Re-render recorded · saving…' : `Re-render · ${Math.round((st.progress || 0) * 100)} %`; say(t); }

  // ---------- export: mix + stems + MIDI (+ MP3), into the sketch's folder ----------
  async function exportSong({ mp3 = true } = {}) {
    const s = song(); if (!S.schedule(s).length) throw Error('Add a take first.');
    s.sketch ||= s.clips[0]?.take.sketch || sketch(); say('Mixing…');
    const r = S.normalize(S.render(s, await sources(s)), -1), names = S.exportNames(s), put = async (name, bytes) => { const x = await hub.vst.parkSave(s.sketch, name, bytes); if (!x?.ok) throw Error(x?.error || 'Could not save ' + name); return x.path; };
    const entry = { at: new Date().toISOString(), seconds: r.length / r.rate, bars: S.bars(s), bpm: s.bpm, gainDb: +r.gainDb.toFixed(2), stems: [] };
    entry.mix = await put(names.mix, P.encodeWav({ rate: r.rate, channels: r.mix }));
    for (let i = 0; i < r.lanes.length; i++) if (r.lanes[i] && !s.lanes[i].mute) { await wait(0); entry.stems.push({ lane: s.lanes[i].name, path: await put(names.stem(i), P.encodeWav({ rate: r.rate, channels: r.lanes[i] })) }); }
    const notesOfClip = {}; for (const c of s.clips) notesOfClip[c.id] = await notesOf(c);
    const notes = S.songNotes(s, notesOfClip); entry.notes = notes.length;
    entry.midi = await put(names.midi, P.midiFile(notes, { bpm: s.bpm, beats: s.beats, name: s.title }));
    entry.json = await put(names.json, JSON.stringify({ v: 1, kind: 'park-song', ...entry, song: { ...s, exports: undefined } }, null, 1));
    if (mp3 && ffmpeg !== false) { const m = await hub.parkSong?.mp3?.(s.sketch, names.mix).catch(err => ({ ok: false, error: err.message })); if (m?.ok) entry.mp3 = m.path; else if (m?.error) entry.mp3Note = m.error; }
    s.exports.unshift(entry); s.exports = s.exports.slice(0, 12); await save();
    try { document.dispatchEvent(new CustomEvent('hearth:quest-week', { detail: { kind: 'park-song', week: P.isoWeek(), at: entry.at, title: `${s.title}: ${entry.bars} bars at ${Math.round(s.bpm)} BPM`, path: entry.mp3 || entry.mix, sketch: s.sketch } })); } catch { /* a listener's problem never blocks an export */ }
    return entry;
  }

  // ---------- proof for "Finish a track" (Codex's proof contract; the review stays the owner's choice) ----------
  async function offer() {
    const s = song(), ex = s.exports[0]; if (!ex) throw Error('Export the song first.');
    const file = ex.mp3 || ex.mix, bytes = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null);
    if (!bytes?.length) throw Error('The exported file is gone (or over 80 MB); export again.');
    const mixBytes = file === ex.mix ? bytes : new Uint8Array(await hub.fs.read(ex.mix, { encoding: 'buffer', maxBytes: 200 * 1048576 }));
    const text = S.proofText(s, P.analyse(P.decodeWav(mixBytes)), { stems: ex.stems.length, mp3: !!ex.mp3 });
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    await Lazy.load('questjournal'); await QuestParisUI.journal();
    const C = QuestCore, Q = QuestParis, J = QuestJournal.paris, state = () => J.ui().state();
    if (!Q.personal.some(t => t.key === S.TRACK_QUEST.key)) Q.personal.push(JSON.parse(JSON.stringify(S.TRACK_QUEST))); // added when missing
    const camp = await J.mutate(st => Q.startPersonal(st, 'track'), 'Finish a track is in your notebook.');
    const q = C.next(state(), camp); if (!q) return `“Finish a track” is already done ✓. The song stays in “${s.sketch}”.`;
    const proof = C.checkProof({ type: 'file', title: file.split(/[\\/]/).pop().slice(0, 200), path: await hub.importRef(file), kind: ex.mp3 ? 'audio/mpeg' : 'audio/wav', bytes: bytes.length, fingerprint, images: [], ...text });
    const intent = `A song made from park loops: ${s.clips.length} clips over ${ex.bars} bars at ${Math.round(s.bpm)} BPM (${ex.seconds.toFixed(1)} s), mixed to −1 dBFS with ${ex.stems.length} stem(s) and the MIDI, arranged in Hearth's Sound desk.`;
    const item = await J.mutate(st => C.submit(st, q.id, proof, intent), 'Song saved as proof. Ask for a review when you like.');
    ex.proof = { quest: q.id, step: q.title, submission: item.id, at: item.at }; await save();
    J.ui().questDetail(q.id);
    return `Song offered as proof for “${q.title}” (Finish a track). Review it from the quest when you like (XP comes after the review, as always).`;
  }

  // ---------- chat: /song … (registered in jam.js so it answers before the creative group loads) ----------
  const WORDS = ['arrange', 'open', 'takes', 'add', 'play', 'stop', 'export', 'rerender', 're-render', 'proof', 'tempo', 'clear', 'list', 'close', 'mute', 'repeat', 'fade', 'trim', 'move', 'remove'];
  async function command(words = '', ctx) {
    const w = String(words).trim(), [sub = '', ...rest] = w.split(/\s+/), arg = rest.join(' '), n = rest.map(Number);
    await desk();
    if (!sub || /^(arrange|open)$/i.test(sub)) return open();
    const s = song();
    if (/^(takes)$/i.test(sub)) { await loadTakes(); return takes.length ? 'Park takes (any sketch):\n' + takes.slice(0, 30).map((t, i) => `${takeLabel(t, i)} · “${t.sketch}”`).join('\n') + '\n/song add <n> [lane 1–5] [bar]' : 'No park takes yet. /jam park record 4'; }
    if (/^list$/i.test(sub)) return s.clips.length ? s.clips.map((c, i) => `${i + 1}. ${s.lanes[c.lane].name} · bar ${c.start + 1} · ${c.take.place} ${c.take.bars} bars${c.repeat > 1 ? ' ×' + c.repeat : ''}${c.rerender ? ` · ↻ ${c.rerender.preset || 'as is'}` : ''}`).join('\n') + (S.warnings(s).length ? '\n⚠ ' + S.warnings(s).join(' ') : '') : 'The song is empty: /song takes, then /song add 1';
    if (/^add$/i.test(sub)) { if (!takes.length) await loadTakes(); const t = takes[(n[0] || 1) - 1]; if (!t) return 'No such take: /song takes'; const c = S.addClip(s, t, { lane: (n[1] || 1) - 1, bar: Number.isFinite(n[2]) ? n[2] - 1 : null }); await save(); if (view) draw(); return `Clip ${s.clips.length}: ${t.place} ${t.bars} bars on ${s.lanes[c.lane].name} at bar ${c.start + 1}.${S.warnings(s).length ? ' ⚠ ' + S.warnings(s).join(' ') : ''}`; }
    if (/^play$/i.test(sub)) return play();
    if (/^stop$/i.test(sub)) { stop(); return 'Stopped.'; }
    if (/^close$/i.test(sub)) { close(); return 'Arrange closed (the song is kept).'; }
    if (/^tempo$/i.test(sub)) { if (!(n[0] >= 40 && n[0] <= 240)) return `The song is at ${Math.round(s.bpm || 0)} BPM; /song tempo 40–240.`; s.bpm = n[0]; await save(); if (view) draw(); return `Tempo ${n[0]} BPM.${S.warnings(s).length ? ' ⚠ ' + S.warnings(s).join(' ') : ''}`; }
    if (/^(repeat|move|trim|fade|mute|remove)$/i.test(sub)) {
      if (/^mute$/i.test(sub)) { const l = s.lanes[(n[0] || 1) - 1]; if (!l) return 'Mute lane 1–5.'; l.mute = !l.mute; await save(); if (view) draw(); return `${l.name} ${l.mute ? 'muted' : 'back on'}.`; }
      const c = S.find(s, n[0]);
      if (/^repeat$/i.test(sub)) S.repeat(s, c.id, n[1] || 1); else if (/^move$/i.test(sub)) S.move(s, c.id, { bar: (n[1] || 1) - 1, lane: Number.isFinite(n[2]) ? n[2] - 1 : null }); else if (/^trim$/i.test(sub)) S.trim(c, n[1], n[2]); else if (/^fade$/i.test(sub)) S.fade(s, c.id, { fadeIn: n[1], fadeOut: n[2] }); else S.remove(s, c.id);
      await save(); if (view) draw(); return /^remove$/i.test(sub) ? 'Clip removed.' : `Clip: bar ${c.start + 1}, ×${c.repeat}, beats ${c.in}–${c.out}, fades ${c.fadeIn}/${c.fadeOut} s.`;
    }
    if (/^re-?render$/i.test(sub)) { const c = S.find(s, n[0] || 1), preset = rest.slice(1).join(' ').replace(/^"|"$/g, '') || undefined; if (c.lane !== S.RERENDER) S.move(s, c.id, { lane: S.RERENDER }); const r = await rerender(c.id, { preset }); if (view) draw(); return `Re-rendered clip ${n[0] || 1} through ${r.instrument}${r.preset ? ` with “${r.preset}”` : ''} (${r.notes} notes). Your own sound is back.`; }
    if (/^export$/i.test(sub)) { const x = await exportSong({ mp3: !/\bno-?mp3\b|\bwav\b/i.test(arg) }); if (view) draw(); return `Exported to “${s.sketch}”: mix (−1 dBFS), ${x.stems.length} stem(s), MIDI${x.mp3 ? ', MP3' : x.mp3Note ? ` (${x.mp3Note})` : ''}. /song proof offers it to “Finish a track”.`; }
    if (/^proof$/i.test(sub)) { const t = await offer(); if (view) draw(); return t; }
    if (/^clear$/i.test(sub)) { stop(); h.state.song = S.create({ title: `${P.placeOf(sketch()) || 'Park'} song`, sketch: sketch() }); await save(); if (view) draw(); return 'The song is empty again (exported files stay in the sketch folder).'; }
    return 'Use /song (open Arrange), takes, add <n> [lane] [bar], list, play, stop, repeat|move|trim|fade <clip> …, mute <lane>, tempo <bpm>, rerender <clip> [preset], export [wav], proof, clear.';
  }
  const complete = a => [['', 'open Arrange (park loops → a song)'], ['takes', 'every park take, any sketch'], ['add 1', 'put take 1 on lane 1 after the last clip'], ['list', 'the clips'], ['play', 'listen'], ['stop', ''], ['repeat 1 4', 'clip 1 four times'], ['rerender 1', 'clip 1 through the synth (a bank preset: rerender 1 Bright pad)'], ['export', 'mix + stems + MIDI (+ MP3)'], ['proof', 'offer it to “Finish a track”'], ['tempo 120', '']].map(([value, hint]) => ({ value, hint })).filter(x => x.value.startsWith(String(a || '').trim().toLowerCase()));
  if (typeof Keys !== 'undefined') Keys.add({ area: 'Sound desk', keys: '← → ↑ ↓ (a clip in Arrange)', what: 'move the clip a bar left / right, or to the lane above / below' });
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: arrange park loops into a song', () => command('').then(t => toast(t, { timeout: 5000 })).catch(err => toast(err.message, { type: 'error' }))); });
  return { open, close, pause, play, stop, rerender, exportSong, offer, command, complete, WORDS, song: () => song(), _test: { takes: () => takes, cache, playing: () => !!player } };
})();
