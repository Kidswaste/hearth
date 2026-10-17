// ▶ Play's sound (round 54, gameaudio): runs INSIDE ▶ Play's game window, first in every HTML page of the game
// (gamemodemain.js serves it on the game's own address and puts its tag first in <head>; gameaudiomain.js makes the tag;
// the game's files are never changed). Sound that's instant and never hitches the picture:
//   warm      the sound system starts while the page loads (one AudioContext made, one silent sample played, then
//             suspended): the first AudioContext of a process costs tens to hundreds of ms on the main thread, paid
//             here behind the getting-ready card instead of on the frame where the game makes its own (three's
//             AudioListener makes it lazily, often on the first sound)
//   latency   an AudioContext the game makes without a latencyHint gets 'interactive' (the smallest buffer the
//             system gives without glitches); it runs at once (the window lets sound play without a click: no input
//             listener of Hearth's in the page); its latency (base + output) is what the F chip and the doctor show
//   decode    the game's sounds decoded before the first frame: an HTML build's (the files its folder served last
//             time: ?s=[…]) and a Lab scene's sound references (its 'refs' message); the game's own decodeAudioData of
//             the same bytes (fingerprint: size + sampled bytes, at the same sample rate) gets the decoded buffer at
//             once, and its fetch of the file is answered from the bytes already read. Every decode is kept for the
//             session (384 MB cap), so a sound decoded again is free.
//   rest      Ctrl/⌘+P back to editing (playloopmain: rest(true, 'loop')) and the window hidden (minimized, the Mac's
//             full-screen space left, covered on Windows: 'hidden') suspend the game's AudioContexts and pause its
//             playing <audio>/<video>; they come back where they were when the game shows again. Only what Hearth
//             paused is resumed (a context the game suspended itself stays so). Losing the focus alone (a game on
//             another screen beside Hearth) keeps the sound: the picture keeps going too.
//   slow      a sound that slowed the picture: the sound system started mid-play, a decode delivered in a long
//             frame (Long Animation Frames), a sound decoded when first played (it came late); GamePerf's doctor
//             reads them (pub().slow / .late) and says it in plain words.
// window.__gameAudio = { pub() → JSON, line() → 'sound 12 ms', rest(on, why), ready(ms), pending(), progress() }.
(() => {
  if (window.__gameAudio) return;
  const Q = new URLSearchParams((document.currentScript?.src || '').split('?')[1] || '');
  const LAB = Q.get('k') === 'lab';
  let LIST = []; try { LIST = JSON.parse(Q.get('s') || '[]').filter((x) => typeof x === 'string').slice(0, 60); } catch { LIST = []; }
  const AC0 = window.AudioContext;
  const none = { pub: () => JSON.stringify({ none: true }), line: () => '', rest: () => 0, ready: () => Promise.resolve(0), pending: () => 0, progress: () => ({ n: 0, done: 0, failed: 0 }) };
  if (typeof AC0 !== 'function') { window.__gameAudio = none; return; }
  const now = () => performance.now();
  const r1 = (x) => Math.round(x * 10) / 10;
  const BAC = (window.BaseAudioContext || AC0).prototype;
  const dad = BAC.decodeAudioData; const sus = AC0.prototype.suspend; const res = AC0.prototype.resume;
  const f0 = window.fetch ? window.fetch.bind(window) : null; const rab = Response.prototype.arrayBuffer;
  const SOUND = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|weba)(\?|#|$)/i;
  const CAP = 384 * 1024 * 1024;
  const S = { warmMs: null, rate: 0, firstCtxMs: null, made: 0, hits: 0, misses: 0, pre: { n: 0, done: 0, failed: 0, bytes: 0 }, kept: 0, events: [], slow: [], late: [], rest: new Set(), at0: now() };
  const cache = new Map(); // fingerprint@rate → { p: Promise<AudioBuffer>, bytes, name }
  const ctxs = []; // WeakRefs of the game's AudioContexts
  const media = []; // WeakRefs of <audio>/<video> the game played
  const ours = new WeakSet(); // contexts Hearth suspended (to resume) · paused media (to play again)
  const gameSuspended = new WeakSet();
  const pend = new Set();
  // (round 55, playbudget) the main-thread time its hooks spend (ms, a running total: tools/playbudget-page.js reads it);
  // OFF: switched off for this game (its hooks pass straight through; Ctrl/⌘+P / hidden still pause the sound)
  let SP = 0; let OFF = null; let loafObs = null;
  const playing = () => { const g = window.__gameReady; return g ? g.phase === 'playing' : now() - S.at0 > 3000; };
  const note = (e) => { e.at = r1(e.at ?? now()); e.playing = playing(); S.events.push(e); if (S.events.length > 60) S.events.shift(); return e; };
  const short = (u) => { try { return decodeURIComponent(new URL(u, location.href).pathname.split('/').pop()) || null; } catch { return null; } };

  // ---------- a fingerprint of a sound file's bytes (size + 64 first + 64 last + ≈ 512 sampled bytes: µs) ----------
  function fp(buf) {
    let u; try { u = ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf); } catch { return null; }
    const n = u.length; if (!n) return null;
    let h = 0x811c9dc5; const mix = (x) => { h ^= x; h = Math.imul(h, 16777619) >>> 0; };
    for (let i = 0; i < Math.min(64, n); i += 1) mix(u[i]);
    for (let i = 64, step = Math.max(1, Math.floor(n / 512)); i < n; i += step) mix(u[i]);
    for (let i = Math.max(0, n - 64); i < n; i += 1) mix(u[i]);
    return `${n}:${h.toString(36)}`;
  }
  function keep(key, b) {
    const bytes = (b.length || 0) * (b.numberOfChannels || 1) * 4;
    if (S.kept + bytes > CAP) { cache.delete(key); return; }
    S.kept += bytes;
  }

  // ---------- warm: the sound system started while loading ----------
  let W = null;
  try {
    const t = now();
    W = new AC0({ latencyHint: 'interactive' });
    S.warmMs = r1(now() - t); S.rate = W.sampleRate;
    const s = W.createBufferSource(); s.buffer = W.createBuffer(1, 1, W.sampleRate); s.connect(W.destination); s.start();
    setTimeout(() => { try { sus.call(W).catch(() => {}); } catch { /* fine */ } }, 400); // (only for decoding at the device's rate from now on: no device held)
  } catch { W = null; }

  // ---------- the game's AudioContexts ----------
  const live = () => { for (let i = ctxs.length - 1; i >= 0; i -= 1) { const c = ctxs[i].deref(); if (!c || c.state === 'closed') ctxs.splice(i, 1); } return ctxs.map((r) => r.deref()).filter(Boolean); };
  class AudioContext extends AC0 {
    constructor(o, ...more) {
      const opts = o && typeof o === 'object' ? (o.latencyHint == null ? { ...o, latencyHint: 'interactive' } : o) : { latencyHint: 'interactive' };
      const t = now();
      super(opts, ...more);
      // (round 55, fixes55) the game's context is made whatever happens in Hearth's notes after it
      try {
        const ms = now() - t;
        S.made += 1; if (S.firstCtxMs == null) S.firstCtxMs = r1(ms);
        ctxs.push(new WeakRef(this)); if (ctxs.length > 16) live();
        note({ kind: 'context', ms: r1(ms), at: t });
        if (S.rest.size) { if (this.state !== 'suspended') { sus.call(this).catch(() => {}); } ours.add(this); } else if (this.state === 'suspended') res.call(this).catch(() => {});
      } catch { /* the game's context, as it is */ }
    }
  }
  window.AudioContext = AudioContext;
  // the game suspending / resuming itself: Hearth never resumes what the game paused; a resume while the game is put
  // away waits for it to show again
  AC0.prototype.suspend = function (...a) { try { gameSuspended.add(this); ours.delete(this); } catch { /* fine */ } return sus.apply(this, a); };
  AC0.prototype.resume = function (...a) { try { gameSuspended.delete(this); if (S.rest.size) { ours.add(this); return Promise.resolve(); } } catch { /* fine */ } return res.apply(this, a); };

  // ---------- decoding: once, before it's needed ----------
  // a sound's file name for plain words: the sound file the page fetched with that many bytes (Resource Timing), else
  // the one it fetched last, a moment ago (three's loader reads through a stream: the bytes don't carry their address)
  // (round 57, sweep57) ▶ Play's hearth-game:// files leave no Resource Timing entry (a custom scheme): the doctor said "a
  // sound" for every one. The sound files the game fetched are noted here too (name, Content-Length, when): same rule
  function nameFor(bytes) {
    try {
      const list = performance.getEntriesByType('resource').filter((e) => SOUND.test(e.name));
      const hit = list.find((e) => bytes && (e.decodedBodySize === bytes || e.encodedBodySize === bytes)) || list.filter((e) => now() - e.responseEnd < 3000).pop();
      if (hit) return short(hit.name);
      const got = asked.find((a) => bytes && a.bytes === bytes) || asked.filter((a) => now() - a.t < 3000).pop();
      return got ? got.name : null;
    } catch { return null; }
  }
  BAC.decodeAudioData = function (buf, ok, fail) {
    if (OFF) return dad.call(this, buf, ok, fail);
    const a0 = now();
    try { return decodeNow.call(this, buf, ok, fail); } finally { SP += now() - a0; }
  };
  function decodeNow(buf, ok, fail) {
    // (round 55, fixes55) Hearth's part (the fingerprint, the cache, the notes) can't stop the game's decode: any throw
    // in it → the browser's own decodeAudioData, as without Hearth
    let key = null; let e = null;
    try { const k = fp(buf); key = k && `${k}@${this.sampleRate}`; e = key && cache.get(key); } catch { key = null; e = null; }
    if (e) {
      S.hits += 1;
      // (a predecode that failed: the game's own decode of its bytes says why, in its own words)
      return e.p.then((b) => { if (typeof ok === 'function') ok(b); return b; }, () => { cache.delete(key); return dad.call(this, buf, ok, fail); });
    }
    if (!key) return dad.call(this, buf, ok, fail);
    S.misses += 1;
    let bytes = 0; let name = null; const t = now(); let was = false;
    try { bytes = buf?.byteLength || 0; name = nameFor(bytes); was = playing(); } catch { /* fine */ }
    const p = dad.call(this, buf).then((b) => {
      try {
        const ev = note({ kind: 'decode', name, bytes, ms: r1(now() - t), secs: r1(b.duration || 0) });
        if (was && ev.ms > 45) { S.late.push({ name, bytes, ms: ev.ms, secs: ev.secs, at: r1(t) }); if (S.late.length > 20) S.late.shift(); }
        keep(key, b);
      } catch { /* fine */ }
      if (typeof ok === 'function') ok(b);
      return b;
    }, (err) => { cache.delete(key); if (typeof fail === 'function') fail(err); throw err; });
    if (key) cache.set(key, { p, bytes, name });
    return p;
  }
  function predecode(ab, name) {
    if (!W || !ab?.byteLength) return null;
    const k = fp(ab); if (!k) return null;
    const key = `${k}@${W.sampleRate}`;
    if (cache.has(key)) return cache.get(key).p;
    S.pre.n += 1; S.pre.bytes += ab.byteLength;
    const p = dad.call(W, ab).then((b) => { S.pre.done += 1; keep(key, b); return b; }, (err) => { S.pre.failed += 1; cache.delete(key); throw err; });
    p.catch(() => {}).finally(() => pend.delete(p));
    pend.add(p);
    cache.set(key, { p, bytes: ab.byteLength, name });
    return p;
  }
  // an HTML build: the sounds its folder served last time (gameaudiomain.js). Their bytes stay in memory too (96 MB cap):
  // the game's own fetch of one is answered from them at once, instead of the file read again and streamed in chunks
  // over the next frames (≈ 100 ms for a 5 MB track)
  const asked = []; // { name, bytes, t } of the last 20 sound files the game fetched (nameFor)
  const askedNote = (url, bytes) => { try { asked.push({ name: short(url), bytes: Number(bytes) || 0, t: now() }); if (asked.length > 20) asked.shift(); } catch { /* fine */ } };
  const files = new Map(); let filesKept = 0; const FILES_CAP = 96 * 1024 * 1024;
  const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', weba: 'audio/webm' };
  if (!LAB && f0) {
    for (const rel of LIST) {
      const url = `/${rel.split('/').map(encodeURIComponent).join('/')}`;
      const p = f0(url).then((r) => (r.ok ? rab.call(r) : null)).then((ab) => {
        if (!ab) return null;
        if (filesKept + ab.byteLength <= FILES_CAP) { files.set(new URL(url, location.href).href, ab.slice(0)); filesKept += ab.byteLength; }
        return predecode(ab, rel.split('/').pop()); // winmac-ok: rel is a URL path (always /)
      }).catch(() => { S.pre.failed += 1; });
      pend.add(p); p.finally(() => pend.delete(p));
    }
    window.fetch = function (input, init) {
      if (OFF) return f0(input, init);
      const a0 = now();
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request && input.method === 'GET' ? input.url : null;
        const snd = url && SOUND.test(url) && (!init?.method || init.method === 'GET');
        const b = snd ? files.get(new URL(url, location.href).href) : null;
        if (b) { S.served = (S.served || 0) + 1; askedNote(url, b.byteLength); SP += now() - a0; return Promise.resolve(new Response(b.slice(0), { status: 200, headers: { 'content-type': MIME[(url.match(SOUND) || [])[1]?.toLowerCase()] || 'application/octet-stream', 'content-length': String(b.byteLength) } })); }
        if (snd) { const p = f0(input, init); p.then((r) => askedNote(url, r.headers.get('content-length')), () => {}); SP += now() - a0; return p; }
      } catch { /* the network's answer, as always */ }
      SP += now() - a0;
      return f0(input, init);
    };
  }
  // a Lab scene: its sound references, as they reach the Lab player
  if (LAB) {
    addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.target !== 'three-sandbox' || d.type !== 'refs' || !Array.isArray(d.items)) return;
      for (const it of d.items) if (it && it.buffer instanceof ArrayBuffer && (it.kind === 'audio' || /^audio\//.test(it.mime || ''))) predecode(it.buffer.slice(0), it.key || null);
    });
  }
  async function ready(ms = 20000) {
    const t = now();
    while (pend.size && now() - t < ms) await Promise.race([Promise.allSettled([...pend]), new Promise((r) => setTimeout(r, Math.max(1, ms - (now() - t))))]);
    return pend.size;
  }

  // ---------- put away: Ctrl/⌘+P (rest), the window hidden ----------
  const mp = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { if (OFF) return mp.apply(this, a); const a0 = now(); try { if (!media.some((r) => r.deref() === this)) { media.push(new WeakRef(this)); if (media.length > 64) media.splice(0, media.length - 64); } ours.delete(this); } catch { /* fine */ } SP += now() - a0; return mp.apply(this, a); };
  function rest(on, why = 'rest') {
    const was = S.rest.size > 0;
    if (on) S.rest.add(why); else S.rest.delete(why);
    if (!on && why === 'loop' && document.visibilityState === 'visible') S.rest.delete('hidden'); // (shown again before the event says so)
    const want = S.rest.size > 0;
    if (want === was) return 0;
    let n = 0;
    const els = [...new Set([...document.querySelectorAll('audio,video'), ...media.map((r) => r.deref()).filter(Boolean)])];
    if (want) {
      for (const c of live()) if (c.state === 'running' && !gameSuspended.has(c)) { sus.call(c).catch(() => {}); ours.add(c); n += 1; }
      for (const m of els) if (!m.paused) { m.pause(); ours.add(m); n += 1; }
    } else {
      for (const c of live()) if (ours.has(c)) { ours.delete(c); res.call(c).catch(() => {}); n += 1; }
      for (const m of els) if (ours.has(m)) { ours.delete(m); mp.call(m).catch(() => {}); n += 1; }
    }
    note({ kind: want ? 'rest' : 'back', why, n });
    return n;
  }
  document.addEventListener('visibilitychange', () => { try { rest(document.visibilityState === 'hidden', 'hidden'); } catch { /* the sound as it is */ } });

  // ---------- a sound in a slow frame (Long Animation Frames: ≥ 50 ms) ----------
  // A decode's result lands on the main thread (the decoded samples handed over, the game's callback): a long frame
  // around it counts when it's clearly longer than this machine's usual long frames (a slow machine has many: only the
  // ones ≥ 1.6× their median count then). The sound system starting is timed itself (its constructor), not here.
  const longs = [];
  try {
    loafObs = new PerformanceObserver((l) => {
      const a0 = now();
      for (const f of l.getEntries()) {
        longs.push([f.startTime, f.duration]); while (longs.length > 40 || (longs.length && f.startTime - longs[0][0] > 3000)) longs.shift();
        const typical = longs.length >= 12 ? [...longs].map((x) => x[1]).sort((x, y) => x - y)[Math.floor(longs.length / 2)] : 0;
        if (f.duration < Math.max(50, typical * 1.6)) continue;
        const a = f.startTime - 1; const b = f.startTime + f.duration + 1;
        for (const e of S.events) {
          if (e.slowMs || !e.playing || e.kind !== 'decode' || e.at < a || e.at > b) continue;
          e.slowMs = r1(f.duration);
          S.slow.push({ kind: 'decode', name: e.name || null, bytes: e.bytes || 0, ms: e.ms, frameMs: e.slowMs, usualMs: typical ? r1(typical) : null, at: e.at }); if (S.slow.length > 20) S.slow.shift();
        }
      }
      SP += now() - a0;
    });
    loafObs.observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* no Long Animation Frames: the sound system's own start still counts */ }

  function latency() {
    let best = null;
    for (const c of live()) if (c.state === 'running') { const ms = ((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000; if (best == null || ms > best.ms) best = { ms: r1(ms), base: r1((c.baseLatency || 0) * 1000), out: r1((c.outputLatency || 0) * 1000), rate: c.sampleRate }; }
    return best;
  }
  const line = () => { const L = latency(); return L ? `sound ${Math.round(L.ms)} ms` : ''; };
  function pub() {
    const L = latency(); const all = live();
    // the sound system started mid-play and took long by itself (no long frame seen: counted all the same)
    const ctxSlow = S.events.filter((e) => e.kind === 'context' && e.playing && e.ms >= 12 && !e.slowMs).map((e) => ({ kind: 'context', ms: e.ms, frameMs: e.ms, at: e.at }));
    return JSON.stringify({ mode: LAB ? 'lab' : 'html', warmMs: S.warmMs, rate: S.rate, hint: 'interactive', contexts: all.length, running: all.filter((c) => c.state === 'running').length, latencyMs: L?.ms ?? null, baseMs: L?.base ?? null, outputMs: L?.out ?? null, made: S.made, firstCtxMs: S.firstCtxMs, hits: S.hits, misses: S.misses, pre: S.pre, fromMemory: S.served || 0, pending: pend.size, keptMB: r1(S.kept / 1048576), rest: S.rest.size > 0, why: [...S.rest], slow: [...S.slow, ...ctxSlow].slice(-10), late: S.late.slice(-10), events: S.events.slice(-12) });
  }
  window.__gameAudio = { pub, line, rest, ready, pending: () => pend.size, progress: () => ({ n: Math.max(S.pre.n, LAB ? 0 : LIST.length), done: S.pre.done, failed: S.pre.failed }),
    // (round 55, playbudget) tools/playbudget-page.js: its time, and off for this game (nothing of it runs per frame)
    budget: { spent: () => SP, pause: () => {}, off: (by) => { if (OFF) return false; OFF = String(by || 'asked'); try { loafObs?.disconnect(); } catch { /* fine */ } return true; } } };
})();
