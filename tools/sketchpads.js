// (round 67, sketchpads67) Sketches → playable material (docs/upgrades/sketchpads67.md). In the Sound desk's Sessions
// list (bouncelog66), every saved 30-second sketch gets two labelled buttons:
//   🎛 Put on a pad   pick an empty pad of a Live set song (liveset64): the WAV becomes a clip there (the whole sketch is
//                     a one-shot pad; a loop trimmed from it is a loop pad). The first clip of a song sets its tempo.
//   ✂ Trim loop       a small waveform with two handles that snap to bars at the session's tempo (or one found in the
//                     audio, or typed in the BPM field), ▶ Preview loop (it loops in the window, no device needed), and
//                     💾 Save loop: a NEW 48 kHz WAV beside the sketch (the sketch is only read). Saved loops are listed
//                     under their sketch (▶, 🎛 Put on a pad, Show file, Remove loop → the Trash), and show up in Arrange
//                     and the Live set's shelf with the park takes (creative-vstmain's parkList).
// Loaded on first use (lazy group 'sketchpads', when Sessions shows a sketch). Cost: nothing until then; the waveform is
// drawn once per tempo; the handles move two divs; the decoded sketch is kept only while its trim is open.
// Pure parts (grid, snapping, tempo finding, the cut): tools/sketchpads-core.js. Files: sketchpadsmain.js.
const SketchPads = (() => {
  const K = SketchPadsCore;
  let h = null, open = null, player = null, actx = null; // open: the one trim / pad box in the list
  const e = (tag, text, cls) => (h?.e ? h.e(tag, text, cls) : Object.assign(document.createElement(tag), text != null ? { textContent: text } : {}, cls ? { className: cls } : {}));
  const say = (box, text) => { const o = box?.querySelector('.sp-said'); if (o && o.textContent !== text) o.textContent = text; return text; };
  const errText = err => (typeof calmError === 'function' ? calmError(err) : err?.message || String(err));
  function btn(label, fn, cls = '', title = '') { // a button that reports its own error in its box (never a dialog)
    const b = e('button', label, cls); b.type = 'button'; if (title) b.title = title;
    b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { say(b.closest('.sp-box') || open?.box, errText(err)); } finally { b.disabled = false; } };
    return b;
  }
  const base = f => String(f).split(/[\\/]/).pop();
  const folderOf = f => String(f).split(/[\\/]/).slice(-2, -1)[0] || 'Sound desk';

  // ---------- the Sessions list: buttons on every sketch, its loops under it ----------
  async function decorate(panel, rows, helpers) {
    if (helpers) h = helpers;
    for (const li of panel.querySelectorAll('.bl-row')) {
      const r = rows.find(x => x.id === li.dataset.session); if (!r) continue;
      const lines = [...li.querySelectorAll(':scope > .bl-sketch')];
      r.sketches.forEach((k, i) => {
        const line = lines[i]; if (!line || line.querySelector('.sp-trim-btn')) return;
        line.append(btn('🎛 Put on a pad', () => padPicker(line, sketchItem(k)), 'sp-pad-btn', 'Pick an empty pad in your Live set: the whole sketch plays there as a one-shot clip'),
          btn('✂ Trim loop', () => trim(line, k), 'sp-trim-btn', 'Cut a loop out of this sketch, snapped to bars: preview it, then save it as a new WAV beside the sketch'));
        const loops = e('div', null, 'sp-loops'); loops.dataset.sketch = k.path; line.after(loops); fillLoops(loops, k);
      });
    }
  }
  const sketchItem = k => ({ kind: 'sketch', file: k.path, label: `Sketch ${new Date(k.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, seconds: k.seconds, bpm: k.bpm || null, loop: false, sketch: k });
  const loopItem = t => ({ kind: 'loop', file: t.loop, label: `Loop ${t.bars} bar${t.bars === 1 ? '' : 's'}`, bpm: t.bpm, bars: t.bars, beats: t.beats || 4, loop: true });
  async function fillLoops(box, k) {
    const r = await hub.sketchpads.loops(k.path).catch(() => null), list = r?.loops || [];
    box.replaceChildren(...list.map(t => {
      const row = e('div', null, 'sp-loop'); row.dataset.loop = t.loop;
      const play = btn('▶', () => playLoop(t.loop, play), 'sp-play', 'Listen to the loop (it repeats)'); play.setAttribute('aria-label', `Play ${base(t.loop)}`);
      row.append(play, e('span', `↳ Loop · ${t.bars} bar${t.bars === 1 ? '' : 's'} · ${Math.round(t.bpm * 10) / 10} BPM · ${t.seconds.toFixed(1)} s`),
        btn('🎛 Put on a pad', () => padPicker(row, loopItem(t)), 'sp-pad-btn', 'Pick an empty pad in your Live set: the loop plays there on the bar'),
        btn('Show file', () => hub.fs.reveal(t.loop), 'bl-quiet'),
        btn('Remove loop', async () => { const files = await hub.sketchpads.trashList(t.loop); if (!files) throw Error('That loop is not in your sketches folder; nothing was removed.'); const x = await hub.fs.trash(files); if (x?.failed?.length) throw Error(x.failed[0].error); if (player?.dataset.file === t.loop) player.pause(); await fillLoops(box, k); h?.say?.('Loop moved to the Trash.'); }, 'bl-quiet', 'Move this loop to the Trash (the sketch stays)'));
      return row;
    }));
    return list;
  }
  function playLoop(file, b) {
    if (player && player.dataset.file === file && !player.paused) { player.pause(); b.textContent = '▶'; return; }
    player?.pause(); stopPreview(); player = new Audio(WinMac.fileUrl(file)); player.dataset.file = file; player.loop = true;
    player.play().catch(() => {}); b.textContent = '■';
    player.addEventListener('pause', () => { if (b.isConnected) b.textContent = '▶'; }, { once: true });
  }
  function close() { stopPreview(); player?.pause(); player = null; open?.box?.remove(); open = null; }
  function boxAfter(anchor, cls, title) {
    close(); const box = e('div', null, `sp-box ${cls}`); box.setAttribute('role', 'group'); box.setAttribute('aria-label', title);
    const head = e('div', null, 'sp-head'), x = btn('✕', () => close(), 'sp-x'); x.setAttribute('aria-label', 'Close'); head.append(e('strong', title), x);
    box.append(head); (anchor.nextElementSibling?.classList.contains('sp-loops') ? anchor.nextElementSibling : anchor).after(box); open = { box }; return box;
  }

  // ---------- 🎛 Put on a pad ----------
  async function liveSet() {
    if (typeof LiveSet === 'undefined' || typeof LiveSetCore === 'undefined') throw Error('The Live set isn\'t loaded: open Creative Playground → Serum 2 / Vital.');
    return LiveSet.set();
  }
  async function tempoOf(item) { // a whole sketch's tempo: the session's, else found in the audio, else 120
    if (item.bpm) return { bpm: item.bpm, from: 'the session' };
    const d = K.detect(await decode(item.file)); return d && d.confidence >= 0.3 ? { bpm: d.bpm, from: 'found in the audio' } : { bpm: 120, from: 'no beat found: 120' };
  }
  async function padPicker(anchor, item) {
    const box = boxAfter(anchor, 'sp-pads', `Put “${item.label}” on a Live set pad`), L = LiveSetCore, set = await liveSet();
    box.append(e('p', item.loop ? 'It plays as a loop pad, launched on the bar.' : 'The whole sketch plays as a one-shot pad. For a loop, use ✂ Trim loop first.', 'sp-dim'));
    const grid = e('div', null, 'sp-songs');
    set.scenes.forEach((sc, ix) => {
      const row = e('div', null, 'sp-song'), cells = e('div', null, 'sp-cells'), clips = L.clips(sc);
      row.append(e('span', `${sc.name} · ${Math.round(sc.bpm)} BPM`, 'sp-song-name'));
      for (let i = 0; i < L.MAX_CLIPS; i++) {
        const key = L.CLIP_KEYS[i];
        if (clips[i]) { const c = e('span', key, 'sp-cell sp-full'); c.title = `Pad ${i + 1}: ${clips[i].label}`; cells.append(c); continue; }
        if (i === clips.length) { const b = btn(`＋ ${key}`, () => place(box, ix, item), 'sp-cell sp-free', `Put it on pad ${i + 1} (key ${key}) of ${sc.name}`); b.setAttribute('aria-label', `Put it on pad ${i + 1} of ${sc.name}`); cells.append(b); continue; }
        cells.append(e('span', key, 'sp-cell sp-later'));
      }
      if (clips.length >= L.MAX_CLIPS) row.append(e('span', 'all 10 pads used', 'sp-dim'));
      row.append(cells); grid.append(row);
    });
    box.append(grid);
    const foot = e('div', null, 'sp-foot');
    if (set.scenes.length < L.MAX_SCENES) foot.append(btn('＋ A new song', () => place(box, 'new', item), 'sp-new', 'A new song in the set, at this sketch\'s tempo, with it on pad 1'));
    foot.append(e('output', '', 'sp-said')); box.append(foot);
    return `“${set.name}”: pick an empty pad.`;
  }
  async function place(box, ix, item) {
    say(box, 'Putting it on the pad…');
    let bpm = item.bpm, bars = item.bars, from = '';
    if (!item.loop) { const t = await tempoOf(item); bpm = t.bpm; from = t.from; bars = K.barsOf(item.seconds, bpm); }
    const r = await LiveSet.addFile(ix, { file: item.file, label: item.label, bpm, bars, beats: item.beats || 4, loop: item.loop });
    const done = e('div', null, 'sp-done');
    done.append(e('span', `✓ On pad ${r.number} (key ${r.key}) of “${r.song}”${from ? ` · ${Math.round(bpm)} BPM, ${from}` : ''}.`),
      btn('🎤 Open the Live set', async () => { close(); BounceLog.closePanel(); await LiveSet.open(); }, 'sp-go', 'Open the Live set to play it'));
    box.querySelector('.sp-songs')?.replaceWith(done); box.querySelector('.sp-new')?.remove();
    return say(box, '');
  }

  // ---------- ✂ Trim loop ----------
  async function decode(file) {
    const b = new Uint8Array(await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).catch(() => new ArrayBuffer(0)));
    if (!b.length) throw Error('The sketch file is gone (moved or removed).');
    const pcm = ParkJamCore.decodeWav(b);
    return pcm.rate === K.RATE ? pcm : { rate: K.RATE, channels: pcm.channels.map(ch => ParkJamCore.resample(ch, pcm.rate, K.RATE)) };
  }
  async function trim(anchor, k) {
    const box = boxAfter(anchor, 'sp-trim', '✂ Trim a loop from this sketch'), T = open;
    say(box, 'Reading the sketch…'); box.append(e('output', 'Reading the sketch…', 'sp-said'));
    const pcm = await decode(k.path), dur = pcm.channels[0].length / pcm.rate; if (open !== T) return '';
    Object.assign(T, { k, pcm, dur, beats: k.beats || 4 });
    // the tempo: the session's, else the last loop's from this sketch, else found in the audio
    let src = k.bpm ? 'from the session' : '', bpm = k.bpm || null;
    if (!bpm) { const last = (await hub.sketchpads.loops(k.path).catch(() => null))?.loops?.[0]; if (last) { bpm = last.bpm; src = 'as your last loop'; } }
    if (!bpm) { const d = K.detect(pcm, { beats: T.beats }); if (d) { bpm = d.bpm; src = d.confidence >= 0.5 ? 'found in the audio' : 'found in the audio (unsure: check it)'; } else { bpm = 120; src = 'no beat found: type it'; } }
    if (open !== T) return '';
    build(box, T); setTempo(T, bpm, src);
    return say(box, `${K.label(T.plan)} · drag the handles; they snap to bars at ${T.bpm} BPM.`);
  }
  function build(box, T) {
    box.querySelector('.sp-said')?.remove();
    const wave = e('div', null, 'sp-wave'), cv = e('canvas', null, 'sp-cv'), sel = e('div', null, 'sp-sel'), hs = e('div', null, 'sp-h sp-h-start'), he = e('div', null, 'sp-h sp-h-end');
    for (const [hd, name] of [[hs, 'Start'], [he, 'End']]) { hd.tabIndex = 0; hd.setAttribute('role', 'slider'); hd.setAttribute('aria-label', `Loop ${name.toLowerCase()} (snaps to ${name === 'Start' ? 'beats' : 'bars'})`); hd.append(e('span', name, 'sp-h-label')); }
    wave.append(cv, sel, hs, he);
    const bpmIn = e('input', null, 'sp-bpm'); bpmIn.type = 'number'; bpmIn.min = '40'; bpmIn.max = '240'; bpmIn.step = '0.1'; bpmIn.setAttribute('aria-label', 'Tempo in BPM');
    bpmIn.onchange = () => { const v = K.parseBpm(bpmIn.value); if (v) { setTempo(T, v, 'typed'); say(box, `${K.label(T.plan)} · snapped to bars at ${v} BPM.`); } else { bpmIn.value = String(T.bpm); say(box, 'Type a tempo from 40 to 240 BPM.'); } };
    const bpmWrap = e('label', null, 'sp-field'); bpmWrap.append(e('span', 'Tempo'), bpmIn, e('span', 'BPM', 'sp-dim'), e('span', '', 'sp-src'));
    const len = e('select', null, 'sp-len'); len.setAttribute('aria-label', 'Loop length in bars'); for (const b of K.BAR_CHOICES) len.append(Object.assign(document.createElement('option'), { value: String(b), textContent: `${b} bar${b === 1 ? '' : 's'}` }));
    len.onchange = () => { move(T, { start: T.plan.start, end: T.plan.start + Number(len.value) * K.barSec(T.bpm, T.beats) }); };
    const lenWrap = e('label', null, 'sp-field'); lenWrap.append(e('span', 'Length'), len);
    const prev = btn('▶ Preview loop', () => (T.src ? stopPreview() : preview(T)), 'sp-preview', 'Hear the loop go round (in the window, through your system output)');
    const save = btn('💾 Save loop', () => saveLoop(T), 'sp-save', 'Save this loop as a new 48 kHz WAV beside the sketch (the sketch stays as it is)');
    const tools = e('div', null, 'sp-tools'); tools.append(bpmWrap, lenWrap, prev, save);
    box.append(wave, e('div', '', 'sp-info'), tools, e('output', '', 'sp-said'));
    Object.assign(T, { wave, cv, sel, hs, he, bpmIn, len, prev });
    drag(T, hs, 'start'); drag(T, he, 'end'); drag(T, sel, 'both');
    for (const [hd, which] of [[hs, 'start'], [he, 'end']]) hd.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return; ev.preventDefault();
      const d = ev.key === 'ArrowLeft' ? -1 : 1, beat = K.beatSec(T.bpm), bar = K.barSec(T.bpm, T.beats);
      move(T, which === 'start' ? { start: T.plan.start + d * beat, end: T.plan.end } : { start: T.plan.start, end: T.plan.end + d * bar });
    });
  }
  function setTempo(T, bpm, src) {
    T.bpm = bpm; T.src0 = src; const ph = K.phase(T.pcm, bpm, T.beats); T.origin = ph.downbeat;
    T.bpmIn.value = String(bpm); T.box = open?.box; open.box.querySelector('.sp-src').textContent = src;
    draw(T);
    const was = T.plan; T.plan = (was && K.plan({ start: was.start, end: was.start + was.bars * K.barSec(bpm, T.beats), bpm, beats: T.beats, origin: T.origin, dur: T.dur })) || K.initial({ bpm, beats: T.beats, origin: T.origin, dur: T.dur, bars: 4 });
    if (!T.plan) { say(open.box, `At ${bpm} BPM a bar is longer than the sketch: try another tempo.`); return; }
    paint(T);
  }
  function draw(T) { // the waveform + the grid, once per tempo (a canvas at the device's pixels)
    const w = Math.max(200, Math.round(T.wave.clientWidth || 560)), hgt = 72, dpr = Math.min(2, window.devicePixelRatio || 1), cv = T.cv;
    cv.width = w * dpr; cv.height = hgt * dpr; cv.style.height = `${hgt}px`; const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hgt);
    for (const l of K.grid({ bpm: T.bpm, beats: T.beats, origin: T.origin, dur: T.dur })) { g.fillStyle = l.bar ? '#ffbe5966' : '#ffffff14'; g.fillRect(Math.round(l.t / T.dur * w), 0, 1, hgt); }
    const p = K.peaks(T.pcm.channels, w); g.fillStyle = '#c9b8ff';
    for (let i = 0; i < w; i++) { const a = Math.max(1, p[i] * (hgt / 2 - 2)); g.fillRect(i, hgt / 2 - a, 1, 2 * a); }
  }
  function paint(T) {
    const p = T.plan, pc = t => `${(t / T.dur * 100).toFixed(3)}%`;
    T.sel.style.left = pc(p.start); T.sel.style.width = pc(p.seconds); T.hs.style.left = pc(p.start); T.he.style.left = pc(p.end);
    T.hs.setAttribute('aria-valuetext', K.clock(p.start)); T.he.setAttribute('aria-valuetext', `${K.clock(p.end)}, ${p.bars} bars`);
    T.len.value = K.BAR_CHOICES.includes(p.bars) ? String(p.bars) : T.len.value;
    const info = T.wave.parentElement.querySelector('.sp-info'), text = `${K.label(p)} · ${T.bpm} BPM`; if (info.textContent !== text) info.textContent = text;
  }
  function move(T, want) {
    const p = K.plan({ ...want, bpm: T.bpm, beats: T.beats, origin: T.origin, dur: T.dur }); if (!p) return;
    const changed = !T.plan || p.start !== T.plan.start || p.bars !== T.plan.bars; T.plan = p; paint(T);
    if (changed && T.src) preview(T); // the preview follows the handles
  }
  function drag(T, el, which) {
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return; ev.preventDefault(); try { el.setPointerCapture(ev.pointerId); } catch { /* not a live pointer */ } el.focus?.({ preventScroll: true });
      const rect = T.wave.getBoundingClientRect(), t0 = (ev.clientX - rect.left) / rect.width * T.dur, p0 = T.plan;
      const onMove = m => {
        const t = Math.max(0, Math.min(T.dur, (m.clientX - rect.left) / rect.width * T.dur));
        move(T, which === 'start' ? { start: t, end: p0.end } : which === 'end' ? { start: p0.start, end: t } : { start: p0.start + (t - t0), end: p0.start + (t - t0) + p0.seconds });
      };
      const onUp = () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); say(open?.box, `${K.label(T.plan)} · snapped to bars at ${T.bpm} BPM.`); };
      el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    });
  }
  // ▶ Preview loop: the window's Web Audio (no instrument host, no device to pick), the loop going round until ■ Stop
  function preview(T) {
    stopPreview(true); player?.pause();
    actx ||= new AudioContext({ latencyHint: 'playback' });
    if (!T.buf) { T.buf = actx.createBuffer(T.pcm.channels.length, T.pcm.channels[0].length, T.pcm.rate); T.pcm.channels.forEach((ch, i) => T.buf.copyToChannel(ch, i)); }
    const s = actx.createBufferSource(); s.buffer = T.buf; s.loop = true; s.loopStart = T.plan.start; s.loopEnd = T.plan.end; s.connect(actx.destination);
    actx.resume?.().catch(() => {}); s.start(0, T.plan.start); T.src = s; T.prev.textContent = '■ Stop';
    return say(open?.box, `Looping ${K.label(T.plan)}.`);
  }
  function stopPreview(quiet) {
    const T = open; if (!T?.src) return ''; try { T.src.stop(); } catch { /* already stopped */ } T.src.disconnect(); T.src = null;
    if (T.prev) T.prev.textContent = '▶ Preview loop'; return quiet ? '' : say(T.box, 'Stopped.');
  }
  // 💾 Save loop: exact frames → 16-bit 48 kHz WAV → main writes it beside the sketch (never over a file)
  async function saveLoop(T) {
    const p = T.plan; if (!p) throw Error('No loop to save at this tempo.');
    const cut = K.cut(T.pcm, K.frames(p, T.pcm.rate)), bytes = ParkJamCore.encodeWav(cut);
    const r = await hub.sketchpads.saveLoop(T.k.path, bytes, { name: K.loopName(T.k.path, p.bars, T.bpm), bpm: T.bpm, bars: p.bars, beats: T.beats, start: p.start, project: folderOf(T.k.path) });
    if (!r?.ok) throw Error(r?.error || 'The loop could not be saved.');
    T.saved = r.path; const loops = document.querySelector(`.sp-loops[data-sketch="${CSS.escape(T.k.path)}"]`); if (loops) await fillLoops(loops, T.k);
    try { document.dispatchEvent(new CustomEvent('hearth:sketch-loop', { detail: { path: r.path, from: T.k.path, bpm: T.bpm, bars: p.bars } })); } catch { /* a listener's problem */ }
    return say(T.box, `Saved “${base(r.path)}” beside the sketch (the sketch is unchanged). It's in Arrange and the Live set's shelf too, and 🎛 Put on a pad is on its line.`);
  }

  // ---------- from chat (secondary): /sessions trim · /sessions pad → the newest sketch ----------
  async function run(words = '') {
    if (typeof ParkJam !== 'undefined') await ParkJam.desk();
    await BounceLog.openPanel();
    const panel = document.querySelector('.bl-panel'), line = await new Promise(res => { let n = 0; const t = setInterval(() => { const l = panel?.querySelector('.bl-sketch .sp-trim-btn')?.closest('.bl-sketch'); if (l || ++n > 100) { clearInterval(t); res(l || null); } }, 30); });
    if (!line) return 'No sketch yet: 💾 Save a 30-second sketch from the strip in the Sound desk first.';
    const r = (BounceLog.list()?.sessions || []).find(x => x.id === line.closest('.bl-row')?.dataset.session), k = r?.sketches[0]; if (!k) return 'No sketch yet.';
    return /^pad/.test(words) ? padPicker(line, sketchItem(k)) : trim(line, k);
  }

  return { decorate, trim, padPicker, close, run, _test: { open: () => open, preview: () => open?.src || null, move: (want) => open && move(open, want), setTempo: (bpm) => open && setTempo(open, bpm, 'typed') } };
})();
