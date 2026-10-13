// The Lab's audio reactivity engine (round 23, labaudio): live input through an AudioWorklet, whole-song features in
// a Worker (cached), and the preview's requests. The analysis math is tools/three-audio-core.js (AudioFeat); the
// slider mapping editor, meters and presets are tools/three-audio-map.js; chat commands tools/three-audio-cmds.js.
//   · Live (🎧 Live → Microphone / an audio interface / a loopback device): the hub page captures (the preview frame
//     can't), the worklet analyses on the audio thread and posts one ArrayBuffer every ~10 ms; it goes to the preview
//     as it is ('af': features + spectrum + waveform, no per-frame objects of numbers), after the latency offset.
//   · Songs: the first time a sketch or a slider reads a feature, the song is decoded at 44.1 kHz and analysed once
//     (100 frames a second, builds and drops over the whole song) in a Worker; kept in IndexedDB by file and length.
//   · Nothing runs for features until something reads one: the worklet only sends the spectrum, no Worker starts.
// Hooks (small): tools/three.js (attach, the live capture start, messages from the preview, the input menu),
// tools/three-media.js (player.bytes), tools/three-tweaks.js (meters and the curve editor on a slider).
const ThreeAudio = (() => {
  const AF = () => (typeof AudioFeat !== 'undefined' ? AudioFeat : null);
  let lab = null; // { player, send, layers, selCtl, selectedLayer, live: { kind, io, setIo, start } }
  const st = { coreSent: false, wanted: false, songWanted: false, frames: 0, sentAt: 0, last: null, lastAt: 0, probes: new Map(), probeN: 0 };
  const live = { node: null, ctx: null, mon: null, source: null, queue: [], rate: 48000 };

  // ---------- labels for people (the mapping editor, commands) ----------
  const GROUPS = [
    ['Drums (heard in the sound)', [['kickOn', 'Kick hits'], ['snareOn', 'Snare hits'], ['hatOn', 'Hat hits'], ['vocalOn', 'Vocal hits'], ['onset', 'Any hit']]],
    ['Bands', [['sub', 'Sub 20–60 Hz'], ['low', 'Bass 60–150'], ['lowMid', 'Low mids 150–400'], ['mids', 'Mids 400–1k'], ['highMid', 'High mids 1–2.5k'], ['presence', 'Presence 2.5–5k'], ['brilliance', 'Brilliance 5–10k'], ['air', 'Air 10k+']]],
    ['Band hits', [['subHit', 'Sub hits'], ['lowHit', 'Bass hits'], ['lowMidHit', 'Low-mid hits'], ['midsHit', 'Mid hits'], ['highMidHit', 'High-mid hits'], ['presenceHit', 'Presence hits'], ['brillianceHit', 'Brilliance hits'], ['airHit', 'Air hits']]],
    ['Tone', [['loudness', 'Loudness (LUFS-ish)'], ['level', 'Level'], ['vocal', 'Vocals (level)'], ['centroid', 'Brightness (centroid)'], ['flux', 'Change (flux)'], ['flatness', 'Noisiness'], ['note', 'Strongest note'], ['keyHue', 'Key as a hue']]],
    ['Rhythm', [['beat', 'Beat pulse'], ['beatPhase', 'Beat phase (0→1)'], ['barPhase', 'Bar phase (0→1)']]],
    ['Song', [['build', 'Builds (ramp to the drop)'], ['drop', 'Drops (pulse after)'], ['intensity', 'Intensity (quiet → loud)']]],
  ];
  const OLD = [['kick', 'Kick (markers / triggers)'], ['snare', 'Snare (markers / triggers)'], ['hats', 'Hats (triggers)'], ['bassHit', 'Bass hit (triggers)'], ['hit', 'Hit (markers)'], ['bass', 'Bass (classic)'], ['mid', 'Mids (classic)'], ['treble', 'Highs (classic)'], ['level', 'Loudness (classic)']];
  const LABEL = Object.fromEntries([...OLD, ...GROUPS.flatMap((g) => g[1])]);
  const label = (name) => LABEL[name] || GROUPS.find((g) => g[1].some((x) => x[0] === name))?.[1].find((x) => x[0] === name)[1] || name; // (round 25: groups added later, e.g. the camera's)
  // every name a slider can follow: the classic bands and the features (chat completion, /react)
  const mappable = () => [...new Set([...OLD.map((x) => x[0]), ...GROUPS.flatMap((g) => g[1].map((x) => x[0]))])];
  // typed words → a feature name ("kick" → kickOn, "hats" → hatOn, "drops" → drop…)
  const ALIAS = { kick: 'kickOn', kicks: 'kickOn', snare: 'snareOn', snares: 'snareOn', hat: 'hatOn', hats: 'hatOn', hihat: 'hatOn', vocals: 'vocal', voice: 'vocal', vox: 'vocalOn', drops: 'drop', builds: 'build', buildup: 'build', loud: 'loudness', lufs: 'loudness', bright: 'centroid', brightness: 'centroid', change: 'flux', bass: 'low', subs: 'sub', highs: 'brilliance', treble: 'brilliance', key: 'keyHue', hue: 'keyHue', bar: 'barPhase', phase: 'beatPhase', hits: 'onset', energy: 'intensity', 'kick-markers': 'kick', 'snare-markers': 'snare', 'hit-markers': 'hit', 'hats-triggers': 'hats', 'bass-triggers': 'bassHit', 'classic-bass': 'bass', 'classic-mids': 'mid', 'classic-highs': 'treble' };
  function resolve(word) {
    const w = String(word || '').trim(); if (!w) return null;
    const all = mappable(); const lw = w.toLowerCase();
    return ALIAS[lw] || all.find((n) => n === w) || all.find((n) => n.toLowerCase() === lw) || all.find((n) => label(n).toLowerCase().startsWith(lw)) || null;
  }

  // ---------- the preview's messages ----------
  function attach(o) {
    lab = o;
    st.coreSent = false;
  }
  const send = (m) => lab?.send(m);
  // a fresh preview page: it asks again on its first read
  function onReady() { st.coreSent = false; st.songWanted = false; }
  function onMessage(msg) {
    if (msg.type === 'audio-want') {
      st.wanted = true;
      if (!st.coreSent && AF()) { send({ type: 'audio-core', src: String(hearthAudioCore) }); st.coreSent = true; }
      setNeed(true);
      if (msg.song) { st.songWanted = true; songFeatures().catch((err) => console.warn('Song features:', err.message)); }
      return true;
    }
    if (msg.type === 'audio-meter') { if (typeof ThreeAudioMap !== 'undefined') ThreeAudioMap.meters(msg.m); return true; }
    if (msg.type === 'audio-probe-result') { st.probes.get(msg.id)?.(msg); st.probes.delete(msg.id); return true; }
    return false;
  }
  // the values of some features in the preview now: { values, source }
  function probe(names = AF()?.NAMES.slice(0, 43) || []) {
    const id = `p${(st.probeN += 1)}`;
    return new Promise((resolve0) => {
      const t = setTimeout(() => { st.probes.delete(id); resolve0(null); }, 2500);
      st.probes.set(id, (m) => { clearTimeout(t); resolve0(m); });
      send({ type: 'audio-probe', id, names });
    });
  }

  // ---------- live input: the worklet ----------
  // called by the Lab's live capture (tools/three.js) with its context, the source and the gain after it; true when
  // the worklet runs (the old analyser timer is then not started)
  async function attachLive({ ctx, source, input, hubLive, io }) {
    const A = AF();
    if (!A || !ctx.audioWorklet) return false;
    try {
      await ctx.audioWorklet.addModule('tools/three-audio-core.js');
      await ctx.audioWorklet.addModule('tools/three-audio-worklet.js');
    } catch (err) { console.warn('Audio worklet unavailable, the analyser timer takes over:', err.message); return false; }
    const node = new AudioWorkletNode(ctx, 'hearth-audio', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { need: st.wanted } });
    input.connect(node); node.connect(ctx.destination); // (its output is silent: connected so the graph pulls it)
    // monitoring: off by default (a mic into speakers feeds back); the input as it comes, before the gain
    const mon = ctx.createGain(); mon.gain.value = monitorOn() ? 1 : 0; source.connect(mon); mon.connect(ctx.destination);
    Object.assign(live, { node, ctx, mon, source, queue: [], rate: ctx.sampleRate });
    const F = A.F; const gain = hubLive.gain;
    node.port.onmessage = (e) => {
      const b = e.data; if (!(b instanceof ArrayBuffer)) return;
      st.frames += 1;
      const head = new Float32Array(b, 0, 2);
      // auto gain (the default): the level steady, quiet or loud (the same as the analyser path did)
      if (io().gain === 'auto') {
        const rms = Math.sqrt(head[0]) / (gain.gain.value || 1);
        hubLive.lvl += (rms - hubLive.lvl) * (rms > hubLive.lvl ? 0.2 : 0.01);
        const tA = performance.now();
        if (tA - hubLive.agcAt > 250 && hubLive.lvl > 0.002) { hubLive.agcAt = tA; hubLive.auto = Math.max(0.5, Math.min(8, 0.12 / hubLive.lvl)); gain.gain.setTargetAtTime(hubLive.auto, ctx.currentTime, 0.6); }
      }
      if (head[1]) { st.last = b; st.lastAt = performance.now(); }
      const msg = { type: 'af', b, F, rate: live.rate };
      const lat = io().latency || 0;
      if (!lat) { send(msg); st.sentAt = performance.now(); return; }
      const tNow = performance.now();
      live.queue.push([tNow, msg]);
      while (live.queue.length && tNow - live.queue[0][0] >= lat) send(live.queue.shift()[1]);
      if (live.queue.length > 64) live.queue.splice(0, live.queue.length - 64);
    };
    return true;
  }
  function detachLive() { try { live.node?.port.postMessage({ stop: true }); } catch { /* closed */ } Object.assign(live, { node: null, ctx: null, mon: null, source: null, queue: [] }); st.last = null; }
  function setNeed(on) { try { live.node?.port.postMessage({ need: Boolean(on) }); } catch { /* closed */ } }
  const monitorOn = () => store.get('three.liveMonitor', false) === true;
  function setMonitor(on) {
    store.set('three.liveMonitor', Boolean(on));
    if (live.mon) live.mon.gain.setTargetAtTime(on ? 1 : 0, live.ctx.currentTime, 0.02);
    return Boolean(on);
  }
  // the last live features (the hub's copy, for /audio and the meters' editor): name → value
  function liveValues() {
    const A = AF(); if (!A || !st.last || performance.now() - st.lastAt > 800) return null;
    const f = new Float32Array(st.last, 8, A.F);
    return Object.fromEntries(A.NAMES.map((n, i) => [n, f[i]]));
  }

  // ---------- inputs: microphones, audio interfaces, loopback devices ----------
  const LOOP = /blackhole|loopback|soundflower|vb-?(audio|cable)|voicemeeter|stereo mix|what u hear|wave out|monitor of/i;
  const isMac = () => /Mac/.test(navigator.platform);
  async function devices() {
    let list = [];
    try { list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch { /* none */ }
    return list.map((d, k) => ({ id: d.deviceId, label: d.label || `Input ${k + 1}`, named: Boolean(d.label), loopback: LOOP.test(d.label || '') }));
  }
  // the device a word names (a part of its label), or the loopback one for "loopback" / "system"
  async function findDevice(q) {
    const ds = await devices(); const w = String(q || '').toLowerCase();
    if (/^(loopback|system|blackhole)$/.test(w)) return ds.find((d) => d.loopback) || null;
    return ds.find((d) => d.label.toLowerCase() === w) || ds.find((d) => d.label.toLowerCase().includes(w)) || null;
  }
  async function useDevice(d) {
    if (!lab) throw new Error('Open the Three.js Lab first');
    lab.live.setIo({ device: d ? d.id : '' });
    if (lab.live.kind() !== 'mic') await lab.live.start('mic');
    return d ? d.label : 'the default input';
  }
  function loopbackHowTo({ show = true } = {}) {
    const steps = isMac() ? [
      'A Mac can\'t hand its own sound to an app directly; a free loopback driver does it:',
      '1. Install BlackHole 2ch (free: existential.audio/blackhole, or brew install blackhole-2ch).',
      '2. Audio MIDI Setup → + → Create Multi-Output Device: tick your speakers / headphones and BlackHole 2ch (speakers first; drift correction on BlackHole).',
      '3. Sound settings → Output → that Multi-Output Device (you still hear everything).',
      '4. Here: 🎧 Live ▾ → Input → 🔁 BlackHole 2ch.',
    ] : [
      'Windows: 🎧 Live → System sound already captures what the PC plays. For a loopback device instead:',
      '1. Install VB-Cable (vb-audio.com) or enable Stereo Mix (Sound settings → Recording).',
      '2. Set the player\'s output to CABLE Input (or keep your speakers with Stereo Mix).',
      '3. Here: 🎧 Live ▾ → Input → 🔁 the loopback device.',
    ];
    const text = [...steps, '', 'Rogue Amoeba Loopback works the same way: Hearth finds these devices by name and lists them first.'].join('\n');
    if (show) Modal.alert('🔁 System audio into the Lab', text);
    return text;
  }
  // 🎧 Live ▾ → Input: the device picker (loopback devices first), monitoring, the how-to
  async function inputMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const ds = await devices(); const cur = lab?.live.io().device || '';
    const loops = ds.filter((d) => d.loopback); const rest = ds.filter((d) => !d.loopback);
    ThreeTweaks.menu(r.left, r.bottom + 4, [
      'Listen to',
      ['Default input', 'What the system uses', () => useDevice(null), !cur],
      ...loops.map((d) => [`🔁 ${d.label}`, 'System audio through a loopback device', () => useDevice(d), d.id === cur]),
      ...rest.map((d) => [`🎙 ${d.label}`, d.named ? 'Mic / audio interface / line-in' : 'names show after the first capture', () => useDevice(d), d.id === cur]),
      !loops.length ? ['🔁 System audio…', isMac() ? 'Install BlackHole (free): how-to' : 'A loopback device: how-to', () => loopbackHowTo()] : null,
      'While listening',
      [`${monitorOn() ? '● ' : ''}Hear the input`, monitorOn() ? 'On: the input plays through your speakers' : 'Off (headphones only with a mic: it feeds back)', () => { setMonitor(!monitorOn()); toast(`Monitoring ${monitorOn() ? 'on' : 'off'}`, { timeout: 1200 }); }],
      ['What it hears now…', 'The audio features, live', () => Commands.run?.('audio', '')],
    ]);
  }

  // ---------- a song's features: once per song, in a Worker, cached ----------
  const VER = 'af1';
  const mem = new Map(); // key → track (the last 3)
  let running = null;
  const keyOf = (p) => `${VER}|${p.path}|${Math.round((p.duration || 0) * 1000)}`;
  function idb() {
    return new Promise((res) => {
      try { const rq = indexedDB.open('hearth-labaudio', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('tracks'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch { res(null); }
    });
  }
  async function idbGet(key) { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const rq = db.transaction('tracks').objectStore('tracks').get(key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch { res(null); } }); }
  async function idbPut(key, track) {
    const db = await idb(); if (!db) return;
    try {
      const os = db.transaction('tracks', 'readwrite').objectStore('tracks');
      os.put({ ...track, at: Date.now() }, key);
      // keep the 12 most recent songs
      const all = os.getAll(); const keys = os.getAllKeys();
      keys.onsuccess = () => { all.onsuccess = () => { const rows = keys.result.map((k, i) => [k, all.result[i]?.at || 0]).sort((a, b) => b[1] - a[1]); for (const [k] of rows.slice(12)) os.delete(k); }; };
    } catch { /* full or private */ }
  }
  async function decode(bytes) {
    const RATE = 44100;
    const buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes.slice(0));
    const n = buf.length; const mono = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c += 1) { const ch = buf.getChannelData(c); for (let i = 0; i < n; i += 1) mono[i] += ch[i] / buf.numberOfChannels; }
    return { mono, rate: RATE };
  }
  function viaWorker(mono, rate, drops, onProgress) {
    return new Promise((resolve0, reject) => {
      let w;
      try { w = new Worker('tools/three-audio-core.js'); } catch { resolve0(null); return; }
      w.onmessage = (e) => { const d = e.data || {}; if (d.progress != null) { onProgress?.(d.progress); return; } w.terminate(); if (d.error) reject(new Error(d.error)); else resolve0(d.track); };
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); resolve0(null); };
      w.postMessage({ id: 1, mono, rate, drops }, [mono.buffer]);
    });
  }
  // the loaded song's features (computed or from the cache) → sent to the preview; returns the track's meta
  async function songFeatures({ again = false } = {}) {
    const p = lab?.player;
    if (!p?.loaded || p.isClock || !p.bytes) return null;
    const key = keyOf(p); const path = p.path;
    let tr = again ? null : mem.get(key) || null;
    if (!tr && !again) tr = await idbGet(key);
    let cached = Boolean(tr);
    if (!tr) {
      if (running?.key === key) return running.promise;
      const job = (async () => {
        const t0 = performance.now();
        const { mono, rate } = await decode(p.bytes);
        const drops = p.analysis?.drops || [];
        let t = await viaWorker(mono, rate, drops, (x) => { songFeatures.progress = x; });
        if (!t) t = AF().analyzeTrack(mono, rate, { drops }); // no Worker: here (rare)
        t.meta.total = Math.round(performance.now() - t0);
        return t;
      })();
      running = { key, promise: job.then((t) => t.meta, () => null) };
      try { tr = await job; } finally { running = null; }
      cached = false;
      idbPut(key, { fps: tr.fps, n: tr.n, F: tr.F, data: tr.data, meta: tr.meta });
    }
    mem.set(key, tr); while (mem.size > 3) mem.delete(mem.keys().next().value);
    // still the same song: off to the preview
    if (lab.player.path === path) send({ type: 'audio-track', track: { fps: tr.fps, n: tr.n, F: tr.F, data: tr.data, meta: tr.meta } });
    return { ...tr.meta, cached };
  }
  const songMeta = () => { const p = lab?.player; if (!p?.loaded) return null; return mem.get(keyOf(p))?.meta || null; };

  return {
    attach, onReady, onMessage, probe, attachLive, detachLive, setNeed, setMonitor, monitorOn, liveValues,
    devices, findDevice, useDevice, inputMenu, loopbackHowTo, songFeatures, songMeta, resolve, label, mappable, GROUPS,
    get lab() { return lab; },
    get stats() { return { frames: st.frames, wanted: st.wanted, worklet: Boolean(live.node), coreSent: st.coreSent, lastSent: st.sentAt }; },
  };
})();
