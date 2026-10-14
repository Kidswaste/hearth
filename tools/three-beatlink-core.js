// ♪ Move with the music (round 38, beatlink): the math, without the DOM. A slider's music link (the same `bindings`
// entry the ♪ panel and the curve editor use, stored with the scene, its templates and packs) gains a "how" and a
// range: { band: <driver>, how: 'pulse' | 'follow' | 'step' | 'random', lo, hi (the slider's own units), att, dec
// (ms), steps, glide (ms), seed }. The preview turns it into the slider's value every frame from the song's time
// alone (the beat grid, the hits found in the song, its envelopes), so a render is the same every time and matches
// the preview; live sound (the computer's or a mic) uses the same shapes on what it hears now.
// It runs in three places from this one file: the Lab (BeatLinkCore: the ♪ popover, /move-with), the preview page
// (sent as source on first use, like the motion kit: tools/three.js sandboxFrame 'lib-need' → globalThis.beatlink)
// and Node (dev/beatlink-test.js).
function hearthBeatLinkCore() {
  // ---------- what drives it ----------
  // hit drivers fire at moments (the grid, the drum hits); level drivers are envelopes 0..1 at the playhead
  const DRIVERS = [
    { id: 'beat', name: 'Beat', kind: 'hit', hint: 'every beat of the grid', words: 'beat beats grid tempo quarter' },
    { id: 'bar', name: 'Bar', kind: 'hit', hint: 'the 1 of every bar', words: 'bar bars downbeat measure one' },
    { id: 'kick', name: 'Kick', kind: 'hit', hint: 'the kick drum hits', words: 'kick kicks bassdrum 808 thump boom' },
    { id: 'snare', name: 'Snare', kind: 'hit', hint: 'the snare / clap hits', words: 'snare snares clap claps backbeat' },
    { id: 'hats', name: 'Hi-hats', kind: 'hit', hint: 'the hi-hat hits', words: 'hats hat hihat hihats hi-hat hi-hats cymbal cymbals shaker' },
    { id: 'bass', name: 'Bass', kind: 'level', hint: 'how loud the low end is', words: 'bass low lows sub subs' },
    { id: 'mids', name: 'Mids', kind: 'level', hint: 'the middle of the sound', words: 'mids mid middle midrange' },
    { id: 'highs', name: 'Highs', kind: 'level', hint: 'the top of the sound', words: 'highs high treble top air bright' },
    { id: 'vocals', name: 'Vocals', kind: 'level', hint: 'the voice (the song\'s parts when split)', words: 'vocals vocal voice singer singing sing' },
    { id: 'drums', name: 'Drums', kind: 'level', hint: 'all the drums (the song\'s parts)', words: 'drums drum percussion beatbox' },
    { id: 'loudness', name: 'Loudness', kind: 'level', hint: 'the whole sound, quiet → loud', words: 'loudness loud level volume overall energy everything' },
  ];
  const DRIVER = Object.fromEntries(DRIVERS.map((d) => [d.id, d]));
  // ---------- how it moves ----------
  const HOWS = [
    { id: 'pulse', name: 'Pulse', hint: 'jumps to the top on each hit and falls back', words: 'pulse pulses pump punch bump hit jump flash throb' },
    { id: 'follow', name: 'Follow', hint: 'rides the level (a beat / bar: a sweep across it)', words: 'follow follows ride level smooth with along track sweep' },
    { id: 'step', name: 'Step', kind: 'step', hint: 'the next value on each hit, round and round', words: 'step steps cycle cycles stepping next sequence advance' },
    { id: 'random', name: 'Random', hint: 'a new random value on each hit', words: 'random randomly shuffle dice jump scatter chaos' },
  ];
  const HOW = Object.fromEntries(HOWS.map((h) => [h.id, h]));
  // defaults per driver / how: quick drums, a slower bar, smooth levels
  function defaults(band, how) {
    const d = DRIVER[band] || DRIVER.kick;
    const dec = band === 'bar' ? 600 : band === 'beat' ? 260 : band === 'hats' ? 110 : band === 'snare' ? 200 : band === 'kick' ? 180 : how === 'pulse' ? 220 : 320;
    return { att: d.kind === 'level' && how === 'follow' ? 60 : 0, dec, steps: 4, glide: 0, seed: 1 };
  }
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
  // a repeatable random number per hit (the same render, the same values)
  function hash01(seed, k) {
    let a = (Math.imul((k | 0) + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((seed | 0) + 1, 0xC2B2AE35)) >>> 0;
    a = Math.imul(a ^ (a >>> 16), 0x7FEB352D) >>> 0; a = Math.imul(a ^ (a >>> 15), 0x846CA68B) >>> 0;
    return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
  }
  const smooth = (u) => u * u * (3 - 2 * u);
  // 1 on a hit, falling over `dec` ms (≈ 5 % left), after rising over `att` ms; the previous hit's tail shows through an attack
  function hitEnv(t, h, att, dec) {
    if (!h || !(t >= h.at)) return 0;
    const e = (dtMs) => (dtMs < 0 ? 0 : dtMs < att ? dtMs / att : Math.exp((-3 * (dtMs - att)) / Math.max(1, dec)));
    const dt = (t - h.at) * 1000;
    let v = e(dt);
    if (dt < att && h.prev != null) v = Math.max(v, e((t - h.prev) * 1000));
    return clamp01(v);
  }
  // a one-pole follower (attack up, decay down) of fn(time), run from a few time constants back to t in 10 ms steps:
  // it depends only on t, so a render steps to the same value at the same time whatever came before
  const STEP = 0.01;
  function follower(fn, t, att, dec) {
    const tau = Math.max(att, dec, 1) / 1000;
    const n = Math.min(400, Math.ceil((tau * 5 + 0.02) / STEP));
    let y = clamp01(fn(t - n * STEP));
    for (let k = n - 1; k >= 0; k -= 1) {
      const x = clamp01(fn(t - k * STEP));
      const tc = (x > y ? att : dec) / 1000;
      y += (x - y) * (tc > 0 ? 1 - Math.exp(-STEP / tc) : 1);
    }
    return y;
  }
  // live: the same follower, kept in st and stepped by the clock (nothing to look back on)
  function followLive(x, att, dec, st, now) {
    x = clamp01(x);
    if (st.t == null) { st.t = now; st.y = x; return x; }
    const dt = Math.min(200, now - st.t);
    if (dt > 0) { const tc = x > st.y ? att : dec; st.y += (x - st.y) * (tc > 0 ? 1 - Math.exp(-dt / tc) : 1); st.t = now; }
    return st.y;
  }
  // a rise in a level (a "hit" in an envelope): what it gained over the last 80 ms, scaled
  const rise = (fn, u) => clamp01((clamp01(fn(u)) - clamp01(fn(u - 0.08))) * 4);
  const stepAt = (k, n) => (n > 1 ? (((k % n) + n) % n) / (n - 1) : 0);

  // ---------- the value ----------
  // link: { band, how, att, dec, steps, glide, seed }; src: { t (s), hit(t) → { k, at, prev, next } | null (the
  // driver's hits, or the beat for a level driver's step / random), beat(t) (the same for the beat), level(t) → 0..1,
  // hist (level(t) can look back: a song), st (state for live), now (ms, live) }.
  // (null: no hit yet; k counts from the first hit, or bar 1, and may be negative before it)
  // → [s, raw]: s 0..1 is where in the range the slider sits (lo + (hi − lo) × s), raw is the driver for the meter.
  function shape(link, src) {
    const d = DRIVER[link.band] || DRIVER.kick;
    const how = HOW[link.how] ? link.how : 'pulse';
    const D = defaults(d.id, how);
    const att = Math.max(0, num(link.att, D.att)); const dec = Math.max(1, num(link.dec, D.dec));
    const t = src.t;
    if (how === 'step' || how === 'random') {
      const h = (d.kind === 'hit' ? src.hit : src.beat)?.(t) || null;
      if (!h) return [0, 0];
      const n = Math.max(2, Math.min(16, Math.round(num(link.steps, 4))));
      const seed = num(link.seed, 1);
      const at = (k) => (how === 'step' ? stepAt(k, n) : hash01(seed, k));
      let s = at(h.k);
      const glide = Math.max(0, num(link.glide, 0));
      if (glide > 0 && h.prev != null) { const u = clamp01(((t - h.at) * 1000) / glide); const p = at(h.k - 1); s = p + (s - p) * smooth(u); }
      return [s, hitEnv(t, h, 0, 150)];
    }
    if (d.kind === 'hit') {
      const h = src.hit?.(t) || null;
      if (how === 'follow' && (d.id === 'beat' || d.id === 'bar')) {
        if (!h || !(h.next > h.at)) return [0, 0];
        const s = clamp01((t - h.at) / (h.next - h.at));
        return [s, hitEnv(t, h, 0, 150)];
      }
      const s = how === 'follow' ? hitEnv(t, h, Math.max(att, 40), Math.max(dec, 450)) : hitEnv(t, h, att, dec);
      return [s, hitEnv(t, h, 0, dec)];
    }
    // a level
    const raw = clamp01(src.level(t));
    if (src.hist) return [how === 'pulse' ? follower((u) => rise(src.level, u), t, att, dec) : follower(src.level, t, att, dec), raw];
    const st = src.st || {};
    if (how === 'pulse') { const lag = followLive(raw, 80, 80, (st.lag ||= {}), src.now); return [followLive(clamp01((raw - lag) * 4), att, dec, (st.out ||= {}), src.now), raw]; }
    return [followLive(raw, att, dec, (st.out ||= {}), src.now), raw];
  }
  // the slider's value: lo + (hi − lo) × s (whole numbers stay whole)
  function value(link, src, int = false) {
    const [s, raw] = shape(link, src);
    const lo = num(link.lo, 0); const hi = num(link.hi, 1);
    const v = lo + (hi - lo) * s;
    return [int ? Math.round(v) : v, raw, s];
  }

  // ---------- hits from a sorted list of times ----------
  function lastIdx(arr, t) { let lo = 0; let hi = arr.length - 1; let k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; }
  // times → hit(t); every: only every n-th (bars from beats), from: the index counted as 0 (bar 1)
  function hitsOf(times, { every = 1, from = 0, period = 0 } = {}) {
    if (!times?.length) return () => null;
    return (t) => {
      const i = lastIdx(times, t);
      if (i < 0) return null;
      if (every === 1) return { k: i, at: times[i], prev: i > 0 ? times[i - 1] : null, next: times[i + 1] ?? times[i] + (period || (i > 0 ? times[i] - times[i - 1] : 0.5)) };
      const n = i - from; const r = ((n % every) + every) % every; const j = i - r;
      if (j < 0) return null;
      const k = Math.floor((j - from) / every);
      const step = j >= every ? times[j] - times[j - every] : (period || 0.5) * every;
      return { k, at: times[j], prev: j - every >= 0 ? times[j - every] : null, next: times[j + every] ?? times[j] + step };
    };
  }
  // a steady clock (no song: 120 BPM; live: the tempo it heard): beats at origin + k × period
  function clockHits(period, origin = 0, every = 1) {
    const P = period * every;
    return (t) => { const k = Math.floor((t - origin) / P + 1e-9); return { k, at: origin + k * P, prev: origin + (k - 1) * P, next: origin + (k + 1) * P }; };
  }
  // an envelope sampled at fps (0..1 after dividing by its peak), read between samples
  function envOf(arr, fps) {
    if (!arr?.length || !(fps > 0)) return () => 0;
    let mx = 0; for (let i = 0; i < arr.length; i += 1) if (arr[i] > mx) mx = arr[i];
    const g = mx > 0 ? 1 / mx : 0;
    return (t) => { const f = t * fps; if (!(f > 0)) return arr[0] * g; const i = Math.floor(f); if (i >= arr.length - 1) return arr[arr.length - 1] * g; const u = f - i; return (arr[i] + (arr[i + 1] - arr[i]) * u) * g; };
  }

  // ---------- making one, naming one, reading typed words ----------
  // a new link on a slider at value v in [min, max]: the range starts at the slider and goes a third of the way up
  // (down when it sits near the top)
  function make({ band = 'kick', how = 'pulse', v = 0, min = 0, max = 1, int = false, seed } = {}) {
    const span = (max - min) || 1;
    let lo = v; let hi = Math.min(max, v + span * 0.35);
    if (hi - lo < span * 0.1) { hi = v; lo = Math.max(min, v - span * 0.35); }
    if (int) { lo = Math.round(lo); hi = Math.round(hi); if (lo === hi) hi = Math.min(max, lo + 1) === lo ? lo - 1 : Math.min(max, lo + 1); }
    const r = (x) => Number(Number(x).toPrecision(6));
    const D = defaults(band, how);
    return { band, how, lo: r(lo), hi: r(hi), att: D.att, dec: D.dec, ...(how === 'step' ? { steps: 4 } : {}), ...(how === 'random' ? { seed: seed ?? 1 } : {}), amount: r((hi - lo) / span) };
  }
  const isLink = (b) => Boolean(b && b.how && HOW[b.how] && DRIVER[b.band]);
  const name = (b) => (DRIVER[b?.band]?.name || String(b?.band || ''));
  // "Kick · pulse", "Bar · step 4"
  const short = (b) => `${name(b)} · ${(HOW[b?.how]?.name || 'pulse').toLowerCase()}${b?.how === 'step' ? ` ${b.steps || 4}` : ''}`;
  const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 -]+/g, ' ');
  // the driver / how named in typed words ("pulse on kick", "the hats", "step each bar") → ids, or null
  function parseDriver(text) {
    const w = fold(text).split(/\s+/).filter(Boolean);
    for (const d of DRIVERS) if (w.some((x) => x === d.id || d.words.split(' ').includes(x))) return d.id;
    return null;
  }
  function parseHow(text) {
    const w = fold(text).split(/\s+/).filter(Boolean);
    for (const h of HOWS) if (w.some((x) => x === h.id || h.words.split(' ').includes(x))) return h.id;
    return null;
  }
  return { DRIVERS, DRIVER, HOWS, HOW, defaults, shape, value, hitEnv, follower, hash01, stepAt, hitsOf, clockHits, envOf, lastIdx, make, isLink, name, short, parseDriver, parseHow };
}
const BeatLinkCore = hearthBeatLinkCore();
// the preview page gets the factory as source (tools/three.js sandboxLib: it runs `(code)()` as a module there)
if (typeof window !== 'undefined') (window.__sbxLibFn ||= {}).beatlink = { toString: () => `function () { globalThis.beatlink = (${hearthBeatLinkCore})(); }` };
if (typeof module !== 'undefined') module.exports = { ...BeatLinkCore, factory: hearthBeatLinkCore };
