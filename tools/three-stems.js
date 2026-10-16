// The song's parts for the Lab (round 30, stems): react to the drums only, the bass only, the voice only. The math is
// tools/three-stems-core.js (StemsCore: harmonic / percussive separation + bands + onsets, no ML); this file runs it
// once per song in a Worker, keeps the result (IndexedDB, 12 songs: it's instant the next time) and hands it to the
// preview, where sketches read audio.stems.drums / kick / snare / hats / bass / vocals / other (0..1, smooth, at the
// playhead) and sliders follow them like any sound ("the drums", "the bass", "the voice" in the ♪ panel, the curve
// editor's sound list, the reaction presets, /react-to).
//   · Nothing runs until a sketch or a slider reads one: the preview asks ('audio-stems-want') on its first read.
//   · While it runs: a small bar on the Lab's rail icon (Progress), never blocking; a short note when it's done.
//   · Exports: the hidden export page gets the same values (toPage), so a render matches the preview.
// Hooks (small): tools/three-audio.js (routes 'audio-stems-want' here; "drums", "voice"… typed words), the sandbox
// (audio.stems + the stem names in featVal), tools/three-tweaks.js (three chips in the ♪ panel), three-export.js.
const LabStems = (() => {
  const C = () => (typeof StemsCore !== 'undefined' ? StemsCore : null);
  const A = () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio : null);
  const lab = () => A()?.lab || null;
  // plain words for people (the ♪ panel, the curve editor, /react-to)
  const PARTS = [['stemDrums', 'The drums'], ['stemBass', 'The bass'], ['stemVocals', 'The voice'], ['stemOther', 'Everything else'], ['stemKick', 'The kick drum'], ['stemSnare', 'The snare'], ['stemHats', 'The hats']];
  const GROUP = 'The song\'s parts (separated)';
  const st = { asks: 0, sent: 0, computed: 0, lastMs: 0, progress: null };

  // ---------- once per song: compute or read the cache ----------
  const VER = 'st1';
  const mem = new Map(); // key → track (the last 3)
  let running = null;
  const keyOf = (p) => `${VER}|${p.path}|${Math.round((p.duration || 0) * 1000)}`;
  function idb() {
    return new Promise((res) => {
      try { const rq = indexedDB.open('hearth-labstems', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('tracks'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch { res(null); }
    });
  }
  async function idbGet(key) { const db = await idb(); if (!db) return null; return new Promise((res) => { try { const rq = db.transaction('tracks').objectStore('tracks').get(key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch { res(null); } }); }
  // the newest cached track for a file path (the export page knows the path, not the length)
  async function idbFind(path) {
    const db = await idb(); if (!db) return null;
    return new Promise((res) => {
      try {
        const os = db.transaction('tracks').objectStore('tracks'); const keys = os.getAllKeys();
        keys.onsuccess = () => { const k = keys.result.filter((x) => String(x).startsWith(`${VER}|${path}|`)).pop(); if (!k) { res(null); return; } const g = os.get(k); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); };
        keys.onerror = () => res(null);
      } catch { res(null); }
    });
  }
  async function idbPut(key, track) {
    const db = await idb(); if (!db) return;
    try {
      const os = db.transaction('tracks', 'readwrite').objectStore('tracks');
      os.put({ ...track, at: Date.now() }, key);
      const all = os.getAll(); const keys = os.getAllKeys();
      keys.onsuccess = () => { all.onsuccess = () => { const rows = keys.result.map((k, i) => [k, all.result[i]?.at || 0]).sort((a, b) => b[1] - a[1]); for (const [k] of rows.slice(12)) os.delete(k); }; };
    } catch { /* full or private */ }
  }
  // an exact ArrayBuffer copy of song bytes (an ArrayBuffer, a typed array or a Node Buffer view: its own bytes only),
  // what decodeAudioData takes: a view's .slice(0) is still a view, and the decode rejects it
  const abCopy = (b) => (ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b)).slice().buffer;
  async function decode(bytes) {
    const RATE = C().RATE; // decoded straight at 22.05 kHz: half the work, plenty for the parts
    const buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(abCopy(bytes));
    const n = buf.length; const mono = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c += 1) { const ch = buf.getChannelData(c); for (let i = 0; i < n; i += 1) mono[i] += ch[i] / buf.numberOfChannels; }
    return { mono, rate: RATE };
  }
  function viaWorker(mono, rate, onProgress) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker('tools/three-stems-core.js'); } catch { resolve(null); return; }
      w.onmessage = (e) => { const d = e.data || {}; if (d.progress != null) { onProgress?.(d.progress); return; } w.terminate(); if (d.error) reject(new Error(d.error)); else resolve(d.track); };
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); resolve(null); };
      w.postMessage({ id: 1, mono, rate }, [mono.buffer]);
    });
  }
  const pkey = (key) => `stems:${key}`;
  function progress(key, pct, label) {
    st.progress = pct;
    try { window.Progress?.set(pkey(key), { pct: Math.round(pct), label, title: 'Lab · the song\'s parts', kind: 'lab:stems', icon: '🥁', where: ['rail:tool:three'], quietMs: 1500 }); } catch { /* no bars */ }
  }
  // the loaded song's parts (computed or cached) → { track, cached }
  async function forSong({ again = false } = {}) {
    const p = lab()?.player;
    if (!C() || !p?.loaded || p.isClock || !p.bytes) return null;
    const key = keyOf(p);
    let tr = again ? null : mem.get(key) || null;
    if (!tr && !again) tr = await idbGet(key);
    let cached = Boolean(tr);
    if (!tr) {
      if (running?.key === key) return running.promise;
      const name = String(p.path || '').split(/[\\/]/).pop();
      const job = (async () => {
        const t0 = performance.now();
        progress(key, 2, `Listening for the drums, bass and voice in ${name}`);
        const { mono, rate } = await decode(p.bytes);
        let t = await viaWorker(mono, rate, (x) => progress(key, 5 + x * 93, 'Separating the drums, bass and voice'));
        if (!t) t = C().separate(mono, rate); // no Worker: here (rare)
        t.meta.total = Math.round(performance.now() - t0);
        return t;
      })();
      running = { key, promise: job.then((t) => ({ track: t, cached: false }), () => null) };
      try { tr = await job; } catch (err) { try { window.Progress?.done(pkey(key), { ok: false, label: err.message }); } catch { /* */ } running = null; throw err; }
      running = null; cached = false;
      st.computed += 1; st.lastMs = tr.meta.total;
      try { window.Progress?.done(pkey(key), { label: `Separated in ${(tr.meta.total / 1000).toFixed(1)} s` }); } catch { /* no bars */ }
      if (tr.meta.total > 1500 && typeof toast === 'function') toast('🥁 The drums, the bass and the voice are ready for this song', { timeout: 2600 });
      idbPut(key, { fps: tr.fps, n: tr.n, F: tr.F, data: tr.data, meta: tr.meta });
    }
    mem.set(key, tr); while (mem.size > 3) mem.delete(mem.keys().next().value);
    return { track: tr, cached };
  }
  const slim = (tr) => ({ fps: tr.fps, n: tr.n, F: tr.F, data: tr.data });
  // the preview read a part: work it out (once) and send it, if the same song is still loaded
  async function want() {
    st.asks += 1;
    const path = lab()?.player?.path;
    const r = await forSong().catch((err) => { console.warn('Stems:', err.message); return null; });
    if (!r || lab()?.player?.path !== path) return;
    lab().send({ type: 'audio-stems', track: slim(r.track) });
    st.sent += 1;
  }
  // the hidden export page: the same values for the same song (after its media-load), if they were worked out
  async function toPage(path, send) {
    if (!path) return false;
    let tr = null;
    for (const [k, t] of mem) if (k.startsWith(`${VER}|${path}|`)) tr = t;
    if (!tr) tr = await idbFind(path);
    if (!tr) return false;
    send({ type: 'audio-stems', track: slim(tr) });
    return true;
  }
  function meta() { const p = lab()?.player; if (!p?.loaded) return null; return mem.get(keyOf(p))?.meta || null; }

  // ---------- the sound pickers, presets and a mission know them ----------
  function join() {
    const a = A();
    if (a && Array.isArray(a.GROUPS) && !a.GROUPS.some((g) => g[0] === GROUP)) a.GROUPS.unshift([GROUP, PARTS]); // first: the easiest picks
    const m = typeof ThreeAudioMap !== 'undefined' ? ThreeAudioMap : null;
    if (m && Array.isArray(m.PRESETS) && !m.PRESETS.some((p) => p.id === 'pump-drums')) {
      m.PRESETS.push(
        { id: 'pump-drums', name: 'Pump with the drums', hint: 'Only the drums (kick, snare, hats) push it, not the bass or the voice', band: 'stemDrums', amount: 0.35, c: { rel: 160 }, fits: /size|scale|pulse|zoom|radius|bump|punch/i },
        { id: 'throb-bass', name: 'Throb with the bass', hint: 'Follows the bass line only (not the kick)', band: 'stemBass', amount: 0.35, c: { att: 20, rel: 220 }, fits: /wobble|warp|bend|displace|bulge|scale|size|thick/i },
        { id: 'glow-voice', name: 'Glow with the voice', hint: 'Rises while someone sings, calm in the instrumental parts', band: 'stemVocals', amount: 0.45, c: { att: 60, rel: 450 }, fits: /glow|bloom|halo|text|title|opacity|alpha|light/i },
        { id: 'drift-rest', name: 'Drift with everything else', hint: 'The pads, chords and synths, without the drums, bass or voice', band: 'stemOther', amount: 0.3, c: { att: 150, rel: 600 }, fits: /hue|color|colour|tint|drift|rot|speed|density/i },
      );
    }
    if (typeof Missions !== 'undefined' && Missions.add) {
      Missions.add({
        id: 'lab-stems', icon: '🥁', label: 'React to the drums, bass and voice',
        desc: 'Each part of the song drives its own thing: the drums punch, the bass swells, the voice glows (split once per song, on this computer).',
        when: (id) => H.agent?.(id)?.dock === 'three',
        submit: (agent, text) => { Native.send(agent, `🥁 Mission: react to the parts of the song separately: audio.stems.drums (or kick / snare / hats), audio.stems.bass and audio.stems.vocals (0..1, smooth) each drive a different element, with a slider for how much each.\n\n${text}`).catch((err) => toast(err.message, { type: 'error' })); return true; },
      });
    }
  }
  join();

  // ---------- chat: /stems (status, again) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('stems')) {
    const pct = (x) => `${Math.round((x || 0) * 100)}%`;
    Commands.register({
      name: 'stems', area: 'Three.js Lab', args: '[again]', aliases: ['song-parts'],
      desc: 'The song split into the drums, the bass, the voice and everything else (once per song, kept): sketches read audio.stems.drums / bass / vocals, sliders follow "the drums"… ("again" redoes it)',
      keywords: 'stems drums bass vocals voice separate split parts kick snare hats react',
      examples: ['/stems', '/stems again', '/react-to size the drums'],
      complete: (a) => (['again'].filter((x) => x.startsWith(String(a || '').trim())).map((value) => ({ value }))),
      run: async (args) => {
        await ThreeLab.cmd();
        for (let i = 0; i < 40 && !lab(); i += 1) await new Promise((r) => setTimeout(r, 50));
        const p = lab()?.player;
        if (!p?.loaded || p.isClock) return 'Load a song first (🎵 in the timeline)';
        const r = await forSong({ again: /again/i.test(args) });
        if (!r) return 'This song has no audio to split';
        lab().send({ type: 'audio-stems', track: slim(r.track) });
        const m = r.track.meta || {}; const mean = m.mean || {};
        return [
          `🥁 **The song's parts** (how busy each is, on average): drums ${pct(mean.drums)} · bass ${pct(mean.bass)} · voice ${pct(mean.vocals)} · everything else ${pct(mean.other)}`,
          r.cached ? 'From the cache (worked out before)' : `Separated in ${((m.total || 0) / 1000).toFixed(1)} s on this computer (kept for next time)`,
          'Sliders: ♪ → The drums / The bass / The voice, or /react-preset pump with the drums. Sketches: audio.stems.drums, .kick, .snare, .hats, .bass, .vocals, .other.',
        ].join('\n');
      },
    });
  }

  return { want, forSong, toPage, meta, join, PARTS, GROUP, get stats() { return { ...st, running: Boolean(running), cachedSongs: mem.size }; } };
})();
