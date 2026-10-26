// (round 68, refab68) 🎧 Reference A/B in the Sound desk (docs/upgrades/refab68.md). A "🎧 Reference" button in the
// desk's top row (next to Sessions) opens a panel over the desk, like Sessions does:
//   Drop a reference track (WAV / MP3 / FLAC / M4A) or "Choose a file…": the window decodes it, measures its loudness
//   (BS.1770 integrated LUFS, K-weighted: an approximation, see tools/refab-core.js) and picks its loudest 15 s as the
//   loop (two handles, Start / End, on its waveform; "Whole track" plays all of it).
//   Your sound: "The desk: its last 30 s" (what the instrument host just played, measured from a scratch copy:
//   'sketch-peek'), or a session sketch / a trimmed loop from Sessions. Its loudness shows beside the reference's.
//   A ⇄ B: one big button switches between yours (A) and the reference (B), level-matched (the louder one is turned
//   down; the dB is shown). Tone balance: low / mid / high, yours vs the reference, in words.
// Playback is the window's Web Audio (said in the panel): on the desk's output device when the window can pick it
// (AudioContext.setSinkId), else the computer's default output. The instrument host is never asked to play a file.
// Loaded on first use (lazy group 'refab'); the measuring runs in a Worker (tools/refab-core.js), never a long task here.
// Nothing is uploaded; the reference file is only read. Closing the panel (or leaving the desk) frees the audio.
const RefAB = (() => {
  const K = RefabCore, LAST = 'hearth.refab.last', MAX_BYTES = 300 * 1048576, WIDTH = 1000;
  let h = null, panel = null, ctx = null, worker = null, wid = 0, ticket = 0;
  const waits = new Map();
  const S = { ref: null, yours: null, items: [], pick: '', ab: 'A', play: null, whole: false, sink: { label: '', desk: '' } };
  const A = () => (typeof WorkbenchVST !== 'undefined' ? WorkbenchVST.api : null);
  const e = (tag, text, cls) => (h?.e ? h.e(tag, text, cls) : Object.assign(document.createElement(tag), text != null ? { textContent: text } : {}, cls ? { className: cls } : {}));
  const errText = err => (typeof calmError === 'function' ? calmError(err) : err?.message || String(err));
  const set = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const q = sel => panel?.querySelector(sel);
  const say = text => { set(q('.ra-said'), text || ''); return text; };
  function btn(label, fn, cls = '', title = '') { // reports its own error in the panel (never a dialog)
    const b = e('button', label, cls); b.type = 'button'; if (title) b.title = title;
    b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { say(errText(err)); } finally { b.disabled = false; } };
    return b;
  }
  const remembered = () => { try { const v = JSON.parse(localStorage.getItem(LAST) || 'null'); return v?.path && v?.name ? v : null; } catch { return null; } };
  const remember = v => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* private storage: no "Use again" */ } };

  // ---------- audio: one context at 48 kHz (decoding + playback), the measuring in a Worker ----------
  function audio() {
    if (ctx && ctx.state !== 'closed') return ctx;
    ctx = new AudioContext({ sampleRate: K.RATE, latencyHint: 'interactive' });
    route().catch(() => {});
    return ctx;
  }
  async function route() { // the desk's output device, when the window can play on it
    const c = A()?.current?.(), desk = c?.stats?.deviceName || '';
    let label = '';
    if (desk && ctx?.setSinkId && navigator.mediaDevices?.enumerateDevices) {
      const outs = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === 'audiooutput');
      const id = K.pickSink(desk, outs);
      if (id) { try { await ctx.setSinkId(id); label = outs.find(d => d.deviceId === id)?.label || ''; } catch { label = ''; } }
    }
    S.sink = { label, desk }; paintOut();
  }
  function outText() {
    const { label, desk } = S.sink;
    if (label) return `Plays on “${label}”, the desk's output, from the window's Web Audio (not through the instrument host).`;
    if (desk) return `Plays through the window's Web Audio on your computer's default output, not through the instrument host: the window can't pick “${desk}” itself, so set it as your system output to hear both on the same interface.`;
    return 'Plays through the window\'s Web Audio on your computer\'s default output (not through the instrument host).';
  }
  function measure(buf, width = 0) {
    const channels = []; for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) channels.push(buf.getChannelData(i).slice());
    if (!worker) { try { worker = new Worker('tools/refab-core.js'); worker.onmessage = ({ data }) => { const w = waits.get(data.id); if (!w) return; waits.delete(data.id); if (data.error) w.reject(Error(data.error)); else w.resolve(data.res); }; worker.onerror = () => { for (const w of waits.values()) w.reject(Error('The measuring stopped.')); waits.clear(); worker?.terminate(); worker = null; }; } catch { worker = null; } }
    if (!worker) return Promise.resolve(K.analyze(channels, buf.sampleRate, { width })); // no Worker here: measured in place
    const id = ++wid;
    return new Promise((resolve, reject) => { waits.set(id, { resolve, reject }); worker.postMessage({ id, channels, rate: buf.sampleRate, width }, channels.map(c => c.buffer)); });
  }
  async function decode(bytes) {
    try { return await audio().decodeAudioData(bytes); } catch { throw Error('That file couldn\'t be read as audio. A reference can be WAV, MP3, FLAC or M4A.'); }
  }

  // ---------- the reference ----------
  async function loadRef(src) {
    const my = ++ticket; say('Reading the reference…');
    let bytes, name, path = '';
    if (src instanceof Blob) {
      name = src.name || 'Reference'; if (!K.isAudioName(name) && !/^audio\//.test(src.type || '')) throw Error(`“${name}” isn't an audio file. A reference can be WAV, MP3, FLAC or M4A.`);
      if (src.size > MAX_BYTES) throw Error(`“${name}” is over ${MAX_BYTES / 1048576} MB; pick a shorter or lighter file.`);
      try { path = window.hub?.pathForFile?.(src) || ''; } catch { path = ''; }
      bytes = await src.arrayBuffer();
    } else {
      name = src.name; path = src.path;
      bytes = await hub.fs.read(path, { encoding: 'buffer', maxBytes: MAX_BYTES }).catch(() => null);
      if (!bytes?.byteLength) throw Error(`“${name}” isn't where it was (moved or removed). Drop it again.`);
      bytes = bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
    }
    const buf = await decode(bytes); if (my !== ticket || !panel) return '';
    say('Measuring its loudness…');
    const res = await measure(buf, WIDTH); if (my !== ticket || !panel) return '';
    stop(true);
    S.ref = { name, path, buf, res, lufs: K.integrated(res), region: K.loudest(res) }; S.whole = false;
    if (path) remember({ path, name });
    draw();
    return say(`“${name}”: ${K.lufsText(S.ref.lufs)} over the whole track. The loop is its loudest ${Math.round(S.ref.region.end - S.ref.region.start)} s; press A ⇄ B to compare.`);
  }

  // ---------- your sound: the desk's last 30 s, or a sketch / loop from Sessions ----------
  async function sessionItems() {
    let rows = typeof BounceLog !== 'undefined' ? BounceLog.list()?.sessions : null;
    if (!rows) { const v = await hub.kvGet('music-sessions', null).catch(() => null); rows = (typeof BounceLogCore !== 'undefined' ? BounceLogCore.validate(v) : v)?.sessions || []; } // read only
    const sketches = rows.flatMap(r => (r.sketches || []).map(k => ({ ...k, when: r.start }))).slice(0, 8), out = [];
    const loops = await Promise.all(sketches.map(k => (hub.sketchpads?.loops ? hub.sketchpads.loops(k.path).catch(() => null) : null)));
    sketches.forEach((k, i) => {
      const t = new Date(k.at), when = `${t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      out.push({ key: k.path, file: k.path, label: `Sketch · ${when} · ${Math.round(k.seconds || 0)} s` });
      for (const l of loops[i]?.loops || []) out.push({ key: l.loop, file: l.loop, label: `  ↳ Loop · ${l.bars} bar${l.bars === 1 ? '' : 's'} · ${Math.round(l.bpm)} BPM (from that sketch)` });
    });
    return out;
  }
  async function items() {
    const c = A()?.current?.(), list = [];
    if (c) list.push({ key: 'desk', label: `The desk: the last 30 s ${c.name} played` });
    list.push(...await sessionItems());
    return list;
  }
  async function loadYours(key) {
    const it = S.items.find(x => x.key === key); if (!it) return '';
    const my = ++ticket; S.pick = key; say(key === 'desk' ? 'Measuring what the desk just played…' : 'Reading your sketch…');
    let bytes;
    if (key === 'desk') {
      const c = A()?.current?.(); if (!c) throw Error('Open Serum 2 or Vital in the Sound desk first.');
      const r = await hub.vst.request({ action: 'sketch-peek', plugin: c.path, name: c.name });
      if (my !== ticket || !panel) return ''; // another choice since
      if (!r?.ok) { S.yours = null; paintYours(); throw Error(/^Nothing to save yet/.test(r?.error || '') ? 'Nothing played in the desk yet: play something, then measure again.' : r?.error || 'The desk\'s sound couldn\'t be measured.'); } // (the host's sketch wording, said for measuring)
      bytes = await hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 80 * 1048576 });
    } else bytes = await hub.fs.read(it.file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).catch(() => null);
    if (!bytes?.byteLength) throw Error('That file is gone (moved or removed).');
    const buf = await decode(bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes); if (my !== ticket || !panel) return '';
    const res = await measure(buf); if (my !== ticket || !panel) return '';
    const playing = !!S.play; stop(true);
    S.yours = { key, label: it.label.trim(), buf, res, lufs: K.integrated(res), tone: K.tone(res) };
    paintYours(); levels(); if (playing) play();
    return say(`Yours: ${K.lufsText(S.yours.lufs)}${key === 'desk' ? ` (the last ${Math.round(buf.duration)} s the desk played)` : ''}.`);
  }

  // ---------- the panel ----------
  async function open(helpers, { file } = {}) {
    if (helpers) h = helpers;
    const host = document.querySelector('.wb-sound-desk'); if (!host) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (typeof BounceLog !== 'undefined') BounceLog.closePanel?.(); // one panel over the desk at a time
    if (!panel?.isConnected) {
      panel = e('section', null, 'ra-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Reference A/B');
      dropZone(panel); host.append(panel); draw();
      S.items = await items(); paintYours();
      const first = S.items[0]; if (first && !S.yours) loadYours(first.key).catch(err => say(errText(err)));
    }
    panel.scrollIntoView?.({ block: 'start' }); q('.ra-close')?.focus({ preventScroll: true });
    if (file) return loadRef(file);
    return S.ref ? 'Reference A/B is open.' : 'Drop a reference track on the panel, or choose a file.';
  }
  function close() { stop(true); ticket++; panel?.remove(); panel = null; S.ref = null; S.yours = null; S.items = []; S.pick = ''; worker?.terminate(); worker = null; waits.clear(); const c = ctx; ctx = null; c?.close?.().catch(() => {}); }
  function dropZone(el) {
    const has = ev => [...(ev.dataTransfer?.types || [])].includes('Files');
    el.addEventListener('dragover', ev => { if (!has(ev)) return; ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = 'copy'; el.classList.add('ra-over'); });
    el.addEventListener('dragleave', ev => { if (!el.contains(ev.relatedTarget)) el.classList.remove('ra-over'); });
    el.addEventListener('drop', ev => { if (!has(ev)) return; ev.preventDefault(); ev.stopPropagation(); el.classList.remove('ra-over'); const f = ev.dataTransfer.files?.[0]; if (f) loadRef(f).catch(err => say(errText(err))); });
  }
  function picker() {
    const inp = e('input', null, 'ra-file'); inp.type = 'file'; inp.accept = '.wav,.wave,.mp3,.flac,.m4a,.aac,.aif,.aiff,audio/*'; inp.hidden = true;
    inp.onchange = () => { const f = inp.files?.[0]; inp.value = ''; if (f) loadRef(f).catch(err => say(errText(err))); };
    return inp;
  }
  function draw() {
    if (!panel) return; const R = S.ref; stopDrag?.(); panel.replaceChildren();
    const head = e('div', null, 'ra-head'), x = btn('✕', () => close(), 'ra-close'); x.setAttribute('aria-label', 'Close Reference A/B');
    head.append(e('strong', '🎧 Reference'), e('span', 'Your sound against a track you love, at the same loudness.', 'ra-dim'), x); panel.append(head);
    const inp = picker(), choose = btn(R ? 'Change…' : 'Choose a file…', () => inp.click(), 'ra-choose', 'Pick a WAV, MP3, FLAC or M4A file (it is only read)');
    if (!R) {
      const zone = e('div', null, 'ra-drop'); zone.append(e('span', 'Drop a reference track here', 'ra-drop-big'), e('span', 'WAV · MP3 · FLAC · M4A', 'ra-dim'), choose, inp);
      const last = remembered(); if (last) zone.append(btn(`Use again: “${last.name}”`, () => loadRef(last), 'ra-again', 'Load the reference you used last time'));
      panel.append(zone);
    } else {
      const line = e('div', null, 'ra-line ra-refline'); line.append(e('span', 'B · Reference', 'ra-tag ra-tag-b'), e('strong', R.name, 'ra-name'), e('span', `${K.clock(R.res.seconds)} · ${K.lufsText(R.lufs)}`, 'ra-num'), choose, inp);
      panel.append(line);
    }
    const yl = e('label', null, 'ra-line ra-yourline'), sel = e('select', null, 'ra-yours'); sel.setAttribute('aria-label', 'Your sound to compare');
    sel.onchange = () => loadYours(sel.value).catch(err => say(errText(err)));
    yl.append(e('span', 'A · Yours', 'ra-tag ra-tag-a'), sel, e('span', '', 'ra-num ra-yours-lufs'), btn('↻ Measure again', () => loadYours('desk'), 'ra-again-desk', 'Measure the desk\'s last 30 seconds again'));
    panel.append(yl);
    if (R) {
      const wave = e('div', null, 'ra-wave'), cv = e('canvas', null, 'ra-cv'), sel2 = e('div', null, 'ra-sel'), hs = e('div', null, 'ra-h ra-h-start'), he = e('div', null, 'ra-h ra-h-end');
      for (const [hd, name] of [[hs, 'Start'], [he, 'End']]) { hd.tabIndex = 0; hd.setAttribute('role', 'slider'); hd.setAttribute('aria-label', `Loop ${name.toLowerCase()}`); hd.append(e('span', name, 'ra-h-label')); }
      wave.append(cv, sel2, hs, he); panel.append(wave);
      const loopLine = e('div', null, 'ra-line ra-loopline'); loopLine.append(e('span', '', 'ra-loop'), btn('', () => setWhole(!S.whole), 'ra-whole', 'Loop the whole track, or just its loudest part'));
      panel.append(loopLine);
      const ab = e('div', null, 'ra-abrow'), big = btn('', () => toggle(), 'ra-ab', 'Switch between your sound (A) and the reference (B); both play at the same loudness');
      big.append(e('span', 'A ⇄ B', 'ra-ab-big'), e('span', '', 'ra-ab-now'));
      ab.append(big, btn('▶ Play', () => (S.play ? stop() : play()), 'ra-play'));
      panel.append(ab, e('p', '', 'ra-match'));
      const tone = e('div', null, 'ra-tone'); tone.setAttribute('aria-label', 'Tone balance, yours against the reference');
      tone.append(e('strong', 'Tone balance', 'ra-tone-title'), e('span', 'yours against the reference, loudness set aside', 'ra-dim'), e('p', '', 'ra-tone-first'));
      for (const b of K.BANDS) { const row = e('div', null, 'ra-band'); row.dataset.band = b.id; const bar = e('div', null, 'ra-bar'); bar.append(e('i', null, 'ra-fill')); row.append(e('span', b.label, 'ra-band-name'), bar, e('span', '', 'ra-band-words')); row.title = `${b.label}: ${b.range}`; tone.append(row); }
      panel.append(tone);
      Object.assign(R, { wave, cv, sel: sel2, hs, he }); drawWave(); handles();
    }
    panel.append(e('p', outText(), 'ra-out'), e('output', '', 'ra-said'));
    paintYours(); paintRegion(); levels(); paintPlay();
  }
  function paintYours() {
    const sel = q('.ra-yours'); if (!sel) return;
    const want = S.items.map(i => `${i.key}\n${i.label}`).join('\n');
    if (sel.dataset.items !== want) {
      sel.replaceChildren(...(S.items.length ? S.items.map(i => Object.assign(document.createElement('option'), { value: i.key, textContent: i.label })) : [Object.assign(document.createElement('option'), { value: '', textContent: 'Nothing of yours yet: open Serum 2 or Vital and play, or save a sketch' })]));
      sel.dataset.items = want;
    }
    if (S.pick && sel.value !== S.pick) sel.value = S.pick;
    sel.disabled = !S.items.length;
    set(q('.ra-yours-lufs'), S.yours ? K.lufsText(S.yours.lufs) : '');
    const again = q('.ra-again-desk'); if (again) again.hidden = S.pick !== 'desk';
  }
  const paintOut = () => set(q('.ra-out'), outText());

  // ---------- the loop region on the reference's waveform ----------
  function drawWave() {
    const R = S.ref, w = Math.max(240, Math.round(R.wave.clientWidth || 640)), hgt = 64, dpr = Math.min(2, window.devicePixelRatio || 1), cv = R.cv;
    cv.width = w * dpr; cv.height = hgt * dpr; cv.style.height = `${hgt}px`; const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hgt);
    const p = R.res.peaks, n = p?.length || 0; g.fillStyle = '#9fd8ff';
    for (let i = 0; i < w && n; i++) { const a = Math.max(0.5, p[Math.min(n - 1, Math.floor(i / w * n))] * (hgt / 2 - 2)); g.fillRect(i, hgt / 2 - a, 1, 2 * a); }
  }
  function paintRegion() {
    const R = S.ref; if (!R?.sel) return;
    const r = S.whole ? { start: 0, end: R.res.seconds } : R.region, pc = t => `${(t / R.res.seconds * 100).toFixed(3)}%`;
    R.sel.style.left = pc(r.start); R.sel.style.width = pc(r.end - r.start); R.hs.style.left = pc(r.start); R.he.style.left = pc(r.end);
    R.hs.hidden = R.he.hidden = S.whole; R.hs.setAttribute('aria-valuetext', K.clock(r.start)); R.he.setAttribute('aria-valuetext', K.clock(r.end));
    set(q('.ra-loop'), `${S.whole ? 'Whole track' : 'Loop'} ${K.clock(r.start)} – ${K.clock(r.end)} (${(r.end - r.start).toFixed(1)} s) · ${K.lufsText(K.integrated(R.res, r.start, r.end))}`);
    set(q('.ra-whole'), S.whole ? 'Loudest part' : 'Whole track');
  }
  const loopOf = () => (S.whole ? { start: 0, end: S.ref.res.seconds } : S.ref.region);
  function setWhole(v) { S.whole = !!v; paintRegion(); levels(); if (S.play) play(); }
  function moveRegion(start, end) {
    const R = S.ref, r = K.region(start, end, R.res.seconds); if (r.start === R.region.start && r.end === R.region.end) return;
    R.region = r; S.whole = false; paintRegion(); levels(); if (S.play) play(); // the loop follows the handles
  }
  let stopDrag = null;
  function handles() {
    const R = S.ref;
    const grab = (el, which) => el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return; ev.preventDefault(); try { el.setPointerCapture(ev.pointerId); } catch { /* not a live pointer */ } el.focus?.({ preventScroll: true });
      const rect = R.wave.getBoundingClientRect(), t0 = (ev.clientX - rect.left) / rect.width * R.res.seconds, r0 = { ...loopOf() };
      let raf = 0, last = null; // one region move per frame at most
      const apply = () => { raf = 0; const t = Math.max(0, Math.min(R.res.seconds, (last.clientX - rect.left) / rect.width * R.res.seconds)); if (which === 'start') moveRegion(t, r0.end); else if (which === 'end') moveRegion(r0.start, t); else { const d = Math.max(-r0.start, Math.min(R.res.seconds - r0.end, t - t0)); moveRegion(r0.start + d, r0.end + d); } };
      const onMove = m => { last = m; if (!raf) raf = requestAnimationFrame(apply); };
      const onUp = () => { if (raf) { cancelAnimationFrame(raf); apply(); } el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); stopDrag = null; };
      stopDrag = onUp; el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    });
    grab(R.hs, 'start'); grab(R.he, 'end'); grab(R.sel, 'both');
    for (const [hd, which] of [[R.hs, 'start'], [R.he, 'end']]) hd.addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return; ev.preventDefault();
      const d = (ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 5 : 0.5), r = loopOf();
      moveRegion(which === 'start' ? r.start + d : r.start, which === 'end' ? r.end + d : r.end);
    });
  }

  // ---------- level matching + tone balance ----------
  function levels() {
    const R = S.ref, Y = S.yours; if (!R || !q('.ra-match')) return null;
    const r = loopOf(), refL = K.integrated(R.res, r.start, r.end), m = Y ? K.match(Y.lufs, refL) : null;
    S.match = m;
    set(q('.ra-match'), Y ? K.matchText(m) : 'Pick your sound above to level-match the two.');
    const cmp = Y ? K.compare(Y.tone, K.tone(R.res, r.start, r.end)) : null;
    set(q('.ra-tone-first'), cmp ? cmp.first : 'The tone balance shows once your sound is measured.');
    for (const row of panel.querySelectorAll('.ra-band')) {
      const c = cmp?.rows.find(x => x.id === row.dataset.band), fill = row.querySelector('.ra-fill'), w = c ? Math.min(50, Math.abs(c.diff) / 12 * 50) : 0;
      const style = c ? `${c.diff < 0 ? `right:50%;` : `left:50%;`}width:${w.toFixed(1)}%` : 'width:0';
      if (fill.getAttribute('style') !== style) fill.setAttribute('style', style);
      fill.className = `ra-fill ${c && Math.abs(c.diff) >= K.SAME_DB ? (c.diff < 0 ? 'ra-less' : 'ra-more') : 'ra-same'}`;
      set(row.querySelector('.ra-band-words'), c ? c.words : '');
    }
    gains();
    return m;
  }
  function gains(ramp = 0.012) {
    const P = S.play; if (!P) return; const m = S.match, t = ctx.currentTime;
    const ga = S.ab === 'A' && S.yours ? K.dbToGain(m?.yoursDb || 0) : 0, gb = S.ab === 'B' || !S.yours ? K.dbToGain(m?.refDb || 0) : 0;
    P.a.gain.setTargetAtTime(ga, t, ramp); P.b.gain.setTargetAtTime(gb, t, ramp);
  }

  // ---------- A ⇄ B ----------
  function play() {
    if (!S.ref) throw Error('Drop a reference track first.');
    stop(true); const c = audio(), r = loopOf(), now = c.currentTime + 0.03;
    const a = c.createGain(), b = c.createGain(); a.gain.value = 0; b.gain.value = 0; a.connect(c.destination); b.connect(c.destination);
    const sb = c.createBufferSource(); sb.buffer = S.ref.buf; sb.loop = true; sb.loopStart = r.start; sb.loopEnd = r.end; sb.connect(b); sb.start(now, r.start);
    let sa = null; if (S.yours) { sa = c.createBufferSource(); sa.buffer = S.yours.buf; sa.loop = true; sa.connect(a); sa.start(now); }
    S.play = { a, b, sa, sb }; c.resume?.().catch(() => {}); gains(0.005); paintPlay();
    return say(S.yours ? `Playing ${S.ab === 'A' ? 'A · yours' : 'B · the reference'}. Press A ⇄ B to switch.` : 'Playing the reference (pick your sound above to compare).');
  }
  function stop(quiet) {
    const P = S.play; if (!P) return ''; S.play = null;
    for (const s of [P.sa, P.sb]) { try { s?.stop(); } catch { /* already stopped */ } s?.disconnect(); }
    P.a.disconnect(); P.b.disconnect(); paintPlay(); return quiet ? '' : say('Stopped.');
  }
  function toggle(to) {
    if (!S.ref) throw Error('Drop a reference track first.');
    if (!S.yours) throw Error('Pick your sound first (the desk, a sketch or a loop).');
    S.ab = to === 'A' || to === 'B' ? to : S.ab === 'A' ? 'B' : 'A';
    if (!S.play) play(); else gains();
    paintPlay();
    return say(S.ab === 'A' ? 'A · yours.' : 'B · the reference.');
  }
  function paintPlay() {
    const ab = q('.ra-ab'); if (!ab) return;
    ab.setAttribute('aria-pressed', String(S.ab === 'B')); ab.dataset.side = S.ab;
    set(ab.querySelector('.ra-ab-now'), S.ab === 'A' ? 'Hearing A · yours' : 'Hearing B · the reference');
    set(q('.ra-play'), S.play ? '■ Stop' : '▶ Play');
  }

  // ---------- from chat (secondary: the 🎧 Reference button is the way in) ----------
  async function run(args = '') {
    const w = String(args).trim().toLowerCase();
    if (typeof ParkJam !== 'undefined') await ParkJam.desk();
    if (!panel?.isConnected) await open(typeof ParkJam !== 'undefined' ? ParkJam.helpers?.() : h);
    if (w === 'ab' || w === 'a' || w === 'b') return toggle(w === 'ab' ? undefined : w.toUpperCase());
    if (w === 'stop') return stop() || 'Stopped.';
    if (w === 'play') return play();
    return S.ref ? 'Reference A/B is open: press A ⇄ B.' : 'Reference A/B is open: drop a reference track on it, or click Choose a file….';
  }
  if (typeof Commands !== 'undefined' && !Commands.get('reference')) {
    Commands.register({ name: 'reference', args: '[ab | play | stop]', area: 'Create', desc: 'Compare your Sound desk sound with a reference track, level-matched: A ⇄ B, a loop on the reference, loudness and tone balance', run: (a, ctx2) => run(a).then(t => t && ctx2?.say?.(t)),
      complete: (a) => [['ab', 'switch A ⇄ B'], ['play', 'play the comparison'], ['stop', 'stop it']].filter(([v]) => v.startsWith(String(a || '').trim().toLowerCase())).map(([value, hint]) => ({ value, hint })),
      examples: ['/reference', '/reference ab'], keywords: 'reference track a/b ab compare level match loudness lufs tone balance mix master serum vital sound desk' });
  }
  try { AppUI.addAction?.('Sound desk: compare with a reference track', () => run('').catch(err => toast(errText(err), { type: 'error' }))); } catch { /* no palette */ }

  return { open, close, run, loadRef, loadYours, play, stop, toggle, isOpen: () => !!panel?.isConnected,
    _test: { state: () => S, levels, moveRegion, setWhole, items: () => S.items, ctx: () => ctx, route } };
})();
