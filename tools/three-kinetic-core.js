// 🅰 Text that moves (round 45, kinetictype): kinetic type presets locked to the music, the math without the DOM.
// A type layer (tools/three-type*.js, textLayer in tools/three-sandbox.html) can step its words / letters / lines in on
// the song's hits instead of on a seconds stagger: one unit on each beat, bar, kick or snare (or on a steady clock of N
// seconds), build up or one at a time, hold some hits, go out, start again; on each hit a punch, a hop, a wave, a
// flicker, a glow, a shake or a highlight moving from word to word. Everything is a function of the song's time alone
// (the hits come from beatlink's sources: your markers, else the song's analysis; no song: the 120 BPM demo beat), so a
// render draws the same frame every time and matches the preview.
// It runs in three places from this one file: the Lab (KineticCore: the picker's live previews, the presets, lyric
// lines on markers), the preview page (sent as source on first use, like ♪ Move with the music: tools/three.js
// sandboxLib 'kinetic' → globalThis.kinetic) and Node (dev/kinetictype-test.js).
function hearthKineticCore() {
  // ---------- what the words move on ----------
  const SYNCS = [
    { id: 'beat', name: 'Beat', hint: 'one step on every beat' },
    { id: 'bar', name: 'Bar', hint: 'one step on the 1 of every bar' },
    { id: 'kick', name: 'Kick', hint: 'one step on every kick drum hit' },
    { id: 'snare', name: 'Snare', hint: 'one step on every snare / clap' },
    { id: 'seconds', name: 'Seconds', hint: 'a steady clock (no music needed)' },
    { id: 'off', name: 'Own timing', hint: 'the type layer\'s own stagger and duration in seconds' },
  ];
  const SYNC_IDS = SYNCS.map((s) => s.id);
  // what happens on each hit, once the words are in
  const FX = [
    { id: 'none', name: 'Nothing', hint: 'the words just sit' },
    { id: 'punch', name: 'Punch', hint: 'scales up on each hit and settles' },
    { id: 'bounce', name: 'Hop', hint: 'hops up on each hit' },
    { id: 'wave', name: 'Wave', hint: 'a wave runs through the letters, one swell per two hits' },
    { id: 'flicker', name: 'Flicker', hint: 'letters flicker for a moment after each hit' },
    { id: 'glow', name: 'Glow', hint: 'flares up on each hit' },
    { id: 'shake', name: 'Shake', hint: 'jolts on each hit' },
    { id: 'highlight', name: 'Highlight', hint: 'the accent color moves word to word, one per hit' },
  ];
  const FX_IDS = FX.map((f) => f.id);
  const FLOWS = ['build', 'one at a time'];
  const UNITS = ['glyph', 'word', 'line'];
  const ORDERS = ['forward', 'reverse', 'center', 'edges', 'random'];

  // ---------- easing (the same 11 the type layer has) ----------
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const bounce = (t) => { const n = 7.5625; const d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
  const EASE = {
    out: (t) => 1 - (1 - t) ** 3, smooth: (t) => t * t * (3 - 2 * t), linear: (t) => t, in: (t) => t * t * t, inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)), expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
    back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2, elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1), bounce, sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  const EASE_IDS = Object.keys(EASE);
  const ease = (name, x) => (EASE[name] || EASE.out)(clamp01(x));
  // a repeatable random number (the same render, the same flicker)
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- order: which unit comes in when (the same ranks as the type layer's own order) ----------
  const rankOf = (u, n, order, seed = 1) => (order === 'reverse' ? n - 1 - u : order === 'center' ? Math.abs(u - (n - 1) / 2) : order === 'edges' ? (n - 1) / 2 - Math.abs(u - (n - 1) / 2) : order === 'random' ? Math.floor(hash(u * 7.13 + seed) * n) : u);
  // how many steps the units take (center / edges bring two in at once)
  const nRanks = (n, order) => (order === 'center' || order === 'edges' ? Math.ceil(Math.max(1, n) / 2) : Math.max(1, n));
  const stepOf = (rank) => Math.max(0, Math.floor(rank + 1e-9));

  // ---------- hits ----------
  // a steady clock: hits at origin + k × period → { k, at, prev, next } (the same shape as beatlink's hit sources)
  function clockHits(period, origin = 0) {
    const P = Math.max(0.02, Number(period) || 0.5);
    return (t) => { const k = Math.floor((t - origin) / P + 1e-9); return { k, at: origin + k * P, prev: origin + (k - 1) * P, next: origin + (k + 1) * P }; };
  }
  // sorted times → the last hit at t (for tests and the picker's previews; the preview page uses beatlink's sources)
  function listHits(times) {
    const T = (times || []).slice().sort((a, b) => a - b);
    return (t) => {
      let lo = 0; let hi = T.length - 1; let i = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m] <= t) { i = m; lo = m + 1; } else hi = m - 1; }
      if (i < 0) return null;
      return { k: i, at: T[i], prev: i > 0 ? T[i - 1] : null, next: T[i + 1] ?? T[i] + (i > 0 ? T[i] - T[i - 1] : 0.5) };
    };
  }

  // ---------- the plan: when each step comes in and goes out, at song time t ----------
  // a = { hit (t → { k, at, prev, next } | null), t, start (the first hit at or after it is step 0), nR (steps),
  //       every (hits per step; 0 = all together), hold (hits the last step stays before going out; 0 = stays),
  //       swap (one at a time: each step goes out when the next comes in), durFrac (an entrance, as a share of the
  //       time between hits) }
  // P (reused, nothing allocated per frame once grown): starts[r] / outs[r] (seconds; Infinity = not yet, -Infinity
  // = long ago), dur, k (hits since step 0, -1 before), local (hits into this round), cur (the step of this hit),
  // sweep (k mod steps: the highlight), pulse (1 on the hit, falling), phase (0..1 to the next hit), gap, at, allIn
  const W = 6; // (how many hits back a time is looked up: older entrances are long finished)
  function newPlan() { return { starts: new Float64Array(16), outs: new Float64Array(16), back: new Float64Array(W + 1), nR: 0, dur: 0.3, k: -1, local: -1, cur: -1, sweep: -1, pulse: 0, phase: 0, gap: 0.5, at: NaN, allIn: Infinity, cycle: 0 }; }
  function plan(P, a) {
    const nR = Math.max(1, a.nR | 0);
    if (P.starts.length < nR) { const n = 2 ** Math.ceil(Math.log2(nR)); P.starts = new Float64Array(n); P.outs = new Float64Array(n); }
    const ev = Math.max(0, Math.round(Number(a.every) || 0));
    const hold = Math.max(0, Math.round(Number(a.hold) || 0));
    const t = Number(a.t) || 0;
    P.nR = nR; P.k = -1; P.local = -1; P.cur = -1; P.sweep = -1; P.pulse = 0; P.phase = 0; P.at = NaN; P.allIn = Infinity; P.cycle = 0;
    const h0 = a.hit(Number(a.start || 0) - 1e-6);
    const k0 = h0 ? h0.k + 1 : 0;
    const hn = a.hit(t);
    if (!hn || hn.k < k0) {
      for (let r = 0; r < nR; r += 1) { P.starts[r] = Infinity; P.outs[r] = Infinity; }
      P.gap = hn && hn.next > hn.at ? hn.next - hn.at : 0.5; P.dur = Math.max(0.03, (Number(a.durFrac) || 0.6) * P.gap);
      return P;
    }
    const gap = Math.min(8, Math.max(0.03, hn.next - hn.at || 0.5));
    P.gap = gap; P.at = hn.at; P.phase = clamp01((t - hn.at) / gap);
    P.dur = Math.max(0.03, (Number(a.durFrac) || 0.6) * gap);
    P.pulse = Math.exp((-3 * (t - hn.at)) / Math.max(0.06, Math.min(0.4, gap * 0.7)));
    const last = (nR - 1) * ev; // (the hit the last step comes in on, from the round's start)
    const C = hold > 0 ? (a.swap ? last + hold : last + hold + 1) : 0; // (a round's length in hits; 0: once, then it stays)
    const kk = hn.k - k0;
    const cyc = C ? Math.floor(kk / C) : 0;
    const base = k0 + cyc * C; const local = kk - cyc * C;
    P.k = kk; P.local = local; P.cycle = cyc;
    P.cur = ev ? Math.min(nR - 1, Math.floor(local / ev)) : nR - 1;
    P.sweep = ((kk % nR) + nR) % nR;
    // the times of the last few hits, walking back from this one
    const B = P.back; B[0] = hn.at; let h = hn; let n = 1;
    for (; n <= W; n += 1) { h = h && h.k > -1e9 ? a.hit(h.at - 1e-6) : null; if (!h || h.k !== hn.k - n) break; B[n] = h.at; }
    const timeAt = (K) => { const d = hn.k - K; if (d < 0) return Infinity; return d < n ? B[d] : -Infinity; };
    for (let r = 0; r < nR; r += 1) {
      P.starts[r] = timeAt(base + r * ev);
      const Kout = !hold ? (a.swap && r < nR - 1 ? base + (r + 1) * Math.max(1, ev) : null) : a.swap && r < nR - 1 ? base + (r + 1) * Math.max(1, ev) : base + last + hold;
      P.outs[r] = Kout == null ? Infinity : timeAt(Kout);
    }
    P.allIn = P.starts[nR - 1];
    return P;
  }

  // ---------- on each hit (after the in / out animation): o = { a, x, y, s, r, glow } in em; returns the accent mix ----------
  function fx(id, o, P, gi, rank, amt = 1) {
    if (!id || id === 'none' || P.k < 0) return 0;
    const pu = P.pulse * amt;
    switch (id) {
      case 'punch': o.s *= 1 + 0.35 * pu; return 0;
      case 'bounce': o.y += 0.32 * pu; return 0;
      case 'wave': o.y += Math.sin((P.k + P.phase) * Math.PI - gi * 0.6) * 0.14 * amt; return 0;
      case 'flicker': if (P.phase < 0.4 && hash(P.k * 131 + gi * 17) < 0.45) o.a *= 0.12; return 0;
      case 'glow': o.glow += 1.4 * pu; return 0;
      case 'shake': { const h1 = hash(P.k * 7 + gi * 3); const h2 = hash(P.k * 11 + gi * 5 + 1); o.x += (h1 - 0.5) * 0.4 * pu; o.y += (h2 - 0.5) * 0.4 * pu; o.r += (h1 - 0.5) * 0.3 * pu; return 0; }
      case 'highlight': if (stepOf(rank) === P.sweep) { o.s *= 1 + 0.08 * pu; return 1; } return 0;
      default: return 0;
    }
  }

  // ---------- the presets (~20): the type layer's sliders + the options; sizes / colors are starting points ----------
  // kSync: what it moves on · kEvery: hits per step (0 = all together) · kHold: hits the last step stays (0 = stays) ·
  // kFlow: build | one at a time · kFx: on each hit · kDur: an entrance as a share of the time between hits ·
  // stagger: seconds between the letters of one step · amount: intensity · kSecs: the clock with "seconds"
  const K = (id, name, desc, sliders, opts = {}, words = 'MAKE IT MOVE') => ({ id, name, desc, sliders, opts: { kinetic: id, ...opts }, words });
  const PRESETS = [
    K('pop-words', 'Word by word pop', 'one word pops in on each beat, the line goes out and starts again', { inAnim: 'scale-pop', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.5, stagger: 0.02, ease: 'back' }),
    K('cascade', 'Letter cascade', 'a word on each beat, its letters falling in one after another', { inAnim: 'drop', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.8, stagger: 0.035, ease: 'out' }),
    K('typewriter', 'Typewriter', 'typed on letter by letter on a steady clock, a cursor-like snap', { inAnim: 'typewriter', outAnim: 'fade', unit: 'glyph', kSync: 'seconds', kSecs: 0.07, kEvery: 1, kHold: 40, kDur: 0.2, stagger: 0 }, { font: 'Consolas, "Courier New", monospace' }),
    K('glitch-in', 'Glitch in', 'each word glitches in on the beat and flickers after each hit', { inAnim: 'glitch', outAnim: 'glitch', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.7, stagger: 0.015, kFx: 'flicker', glow: 0.3, glowColor: '#00e0ff' }),
    K('slide-blur', 'Slide & blur', 'words slide in from the side out of a blur, one per beat', { inAnim: 'slide-blur', outAnim: 'slide-blur', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.8, stagger: 0.01, ease: 'expo' }),
    K('kick-punch', 'Scale punch on kick', 'the whole line punches on every kick', { inAnim: 'fade', outAnim: 'none', unit: 'line', kSync: 'kick', kEvery: 0, kHold: 0, kDur: 0.4, kFx: 'punch', amount: 1.2, stagger: 0 }),
    K('wave', 'Wave', 'letters rise in on the beat and a wave keeps running through them', { inAnim: 'wave', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 8, kDur: 0.8, stagger: 0.03, kFx: 'wave' }),
    K('split', 'Split reveal', 'each line splits open from its middle on the bar', { inAnim: 'split', outAnim: 'split', unit: 'line', kSync: 'bar', kEvery: 1, kHold: 2, kDur: 0.6, stagger: 0, ease: 'expo' }, {}, 'MAKE IT\nMOVE'),
    K('outline-draw', 'Outline draw', 'outlines draw on letter by letter, the fill floods in after', { inAnim: 'outline-draw', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.9, stagger: 0.04, outline: 0.035, outlineColor: '#ffffff', ease: 'smooth' }),
    K('bounce', 'Bounce', 'words bounce in on the beat and hop on every kick after', { inAnim: 'bounce', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.9, stagger: 0.02, kFx: 'bounce', amount: 0.8 }),
    K('flicker', 'Neon flicker', 'flickers on like a neon sign, a flicker after each beat', { inAnim: 'neon', outAnim: 'neon', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 6, kDur: 0.9, stagger: 0.04, kFx: 'flicker', color: '#ffe6ff', glow: 1.1, glowColor: '#ff2bd6' }),
    K('zoom-through', 'Zoom through', 'one word at a time flies at you from far away and passes the camera', { inAnim: 'zoom-through', outAnim: 'zoom', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 1, kFlow: 'one at a time', kDur: 0.5, stagger: 0, ease: 'expo' }),
    K('stagger-rise', 'Stagger rise', 'letters rise from the baseline one after another, a word per bar', { inAnim: 'rise', outAnim: 'rise', unit: 'word', kSync: 'bar', kEvery: 1, kHold: 2, kDur: 0.5, stagger: 0.05, ease: 'expo' }),
    K('highlight', 'Highlight sweep', 'the whole line in, the accent color moves word to word on each beat', { inAnim: 'fade', outAnim: 'none', unit: 'word', kSync: 'beat', kEvery: 0, kHold: 0, kDur: 0.4, kFx: 'highlight', stagger: 0, color2: '#ffd75e' }),
    K('countdown', 'Countdown', '4 · 3 · 2 · 1 · GO, one on each beat, popping', { inAnim: 'scale-pop', outAnim: 'zoom', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 2, kFlow: 'one at a time', kDur: 0.35, stagger: 0, kFx: 'punch', size: 0.3 }, {}, '4 3 2 1 GO'),
    K('line-per-bar', 'Line per bar', 'each line of the text takes a bar, sliding up as the next replaces it', { inAnim: 'slide-up', outAnim: 'slide-up', unit: 'line', kSync: 'bar', kEvery: 1, kHold: 1, kFlow: 'one at a time', kDur: 0.5, stagger: 0, ease: 'expo' }, {}, 'MAKE IT\nMOVE\nWITH THE\nMUSIC'),
    K('snare-shake', 'Snare shake', 'words slam in on the beat and jolt on every snare', { inAnim: 'zoom', outAnim: 'fade', unit: 'word', kSync: 'snare', kEvery: 1, kHold: 4, kDur: 0.3, stagger: 0, kFx: 'shake', amount: 1.2, ease: 'expo' }),
    K('wide-tight', 'Wide to tight', 'letters gather from wide spacing, a word per bar', { inAnim: 'tracking', outAnim: 'tracking', unit: 'word', kSync: 'bar', kEvery: 1, kHold: 2, kDur: 0.9, stagger: 0, ease: 'expoInOut' }),
    K('spin-in', 'Spin in', 'each word spins in on the beat', { inAnim: 'spin', outAnim: 'fade', unit: 'word', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 0.6, stagger: 0.02, ease: 'back' }),
    K('kick-stamp', 'Stamp on kick', 'each word stamps down hard on a kick and glows', { inAnim: 'zoom', outAnim: 'fade', unit: 'word', kSync: 'kick', kEvery: 1, kHold: 4, kDur: 0.2, stagger: 0, kFx: 'glow', ease: 'expo', glowColor: '#ff8c42' }),
    K('elastic', 'Elastic snap', 'words snap in on a spring, one per beat, from the middle out', { inAnim: 'elastic', outAnim: 'fade', unit: 'word', order: 'center', kSync: 'beat', kEvery: 1, kHold: 4, kDur: 1, stagger: 0.02 }),
    K('lyric-line', 'Lyric line', 'lyrics: each line rises in word by word as it is sung, a punch on the kick', { look: 'lines', inAnim: 'rise', outAnim: 'fade', unit: 'word', kSync: 'kick', kFx: 'punch', amount: 0.5, stagger: 0.08, dur: 0.45, size: 0.08, ease: 'expo' }, { lyrics: [] }),
  ];
  const preset = (q) => { const w = String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); if (!w) return null; return PRESETS.find((p) => p.id.replace(/-/g, '') === w || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === w) || PRESETS.find((p) => p.id.replace(/-/g, '').startsWith(w) || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '').startsWith(w)) || PRESETS.find((p) => `${p.name} ${p.desc}`.toLowerCase().includes(String(q).toLowerCase())) || null; };

  // ---------- lyric lines on markers: line i starts on marker i (the Hit lane you tap with H, else cues) ----------
  // lines: [{ text }] or strings · marks: seconds → [{ a, b, text }] (lines past the last marker follow on at the
  // markers' average spacing); a line ends just before the next starts
  function linesOnMarks(lines, marks, { duration = Infinity } = {}) {
    const L = (lines || []).map((x) => (typeof x === 'string' ? { text: x } : { text: String(x.text || '') })).filter((x) => x.text.trim());
    const M = (marks || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!L.length) return { lines: [], used: 0 };
    const gaps = []; for (let i = 1; i < M.length; i += 1) gaps.push(M[i] - M[i - 1]);
    const avg = gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : 2.5;
    const out = []; let at = M.length ? M[0] : 0;
    for (let i = 0; i < L.length; i += 1) {
      at = i < M.length ? M[i] : (out.length ? out[out.length - 1].a + avg : at);
      out.push({ a: Math.round(at * 1000) / 1000, b: 0, text: L[i].text.trim() });
    }
    for (let i = 0; i < out.length; i += 1) {
      const nx = out[i + 1]?.a;
      out[i].b = Math.round(Math.min(duration, nx != null ? Math.max(out[i].a + 0.2, nx - 0.05) : out[i].a + avg) * 1000) / 1000;
    }
    return { lines: out, used: Math.min(M.length, L.length) };
  }

  return { SYNCS, SYNC_IDS, FX, FX_IDS, FLOWS, UNITS, ORDERS, EASE, EASE_IDS, ease, hash, rankOf, nRanks, stepOf, clockHits, listHits, newPlan, plan, fx, PRESETS, preset, linesOnMarks };
}
const KineticCore = hearthKineticCore();
// the preview page gets the factory as source (tools/three.js sandboxLib: it runs `(code)()` as a module there)
if (typeof window !== 'undefined') { (window.__sbxLibFn ||= {}).kinetic = { toString: () => `function () { globalThis.kinetic = (${hearthKineticCore})(); }` }; window.KineticCore = KineticCore; }
if (typeof module !== 'undefined') module.exports = { ...KineticCore, factory: hearthKineticCore };
