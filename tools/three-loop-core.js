// ∞ Make it loop (round 31, perfectloop): the model, Node-testable (dev/perfectloop-test.js). The Lab side is
// tools/three-loop.js; the preview's clock and the sketch helpers (loopT, loopSin, loopNoise…) are in
// tools/three-sandbox.html ("perfect loop").
//   plan(o)          where the loop sits and how long it is: N bars of the song (from the bar the playhead is in) or
//                    N seconds of the scene's own timeline; its frames and the one-beat cross-fade
//   parse(text)      "4 bars", "8 s", "off", "check", "render", "blend" → what was asked
//   fold / phase     the loop's clock: a time folded into the loop, its 0..1 phase (whole turns)
//   valueAt / close  keyframes: the value at a time (the Lab's eases), and the keys that bring a setting back to its
//                    start value at the loop's end (null when it already comes back)
//   seam(frames)     the seamless check on small gray frames, with publishkit's loop check (PublishCore.seam)
//   verdict(r)       "≈ seamless" / "a visible jump" in plain words
const LoopCore = (() => {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BARS = [1, 2, 4, 8, 16];
  const SECS = [2, 4, 6, 8, 10, 15];

  const barLen = (bpm = 120, bpb = 4) => (bpb * 60) / (bpm > 0 ? bpm : 120);
  // song: { bpm, bpb, anchor (s of a bar's beat 1), duration } (null: the scene's own timeline) · clock: { len } ·
  // at: the playhead · F: frames a second · fade: blend the last beat into the first
  // → { kind: 'bars' | 'secs', bars?, a, len, b, F, L (frames), X (cross-fade frames), beat (s), fit (the clock needs
  //   to be this long) }
  function plan({ song = null, clock = null, bars = null, secs = null, at = 0, F = 30, fade = false } = {}) {
    F = F > 0 ? F : 30;
    let a; let len; let kind;
    if (song && song.bpm > 0) {
      kind = 'bars';
      bars = clamp(Math.round(Number(bars) || 4), 1, 64);
      const bar = barLen(song.bpm, song.bpb || 4);
      const anchor = Number(song.anchor) || 0;
      a = anchor + Math.floor((Math.max(0, at) - anchor) / bar + 1e-6) * bar;
      if (a < 0) a += bar * Math.ceil(-a / bar);
      len = bar * bars;
      const D = Number(song.duration) || 0;
      if (D && a + len > D + 1e-3) { a = Math.max(0, anchor + Math.floor((D - len - anchor) / bar + 1e-6) * bar); if (a + len > D + 1e-3) len = Math.max(bar, D - a); }
    } else {
      kind = 'secs';
      const own = Number(clock?.len) || 0;
      secs = Number(secs) > 0 ? Number(secs) : own > 0 && own <= 20 ? own : 8;
      secs = clamp(secs, 0.5, 600);
      len = Math.round(secs * F) / F; // whole frames
      a = 0;
    }
    const beat = kind === 'bars' ? 60 / song.bpm : 0.5;
    const L = Math.max(2, Math.round(len * F));
    const X = fade ? Math.min(Math.floor(L / 3), Math.max(4, Math.round(beat * F))) : 0;
    return { kind, ...(kind === 'bars' ? { bars, bpm: song.bpm } : { secs: r4(len) }), a: r4(a), len: r4(len), b: r4(a + len), F, L, X, beat: r4(beat), fit: kind === 'secs' ? r4(a + len) : null };
  }
  // what the words ask: "4 bars", "8s", "8 seconds", "off", "check", "render", "blend" / "no blend", "status"
  function parse(text = '') {
    const s = String(text || '').toLowerCase();
    const o = {};
    const bars = s.match(/(\d+(?:\.\d+)?)\s*(?:bars?|mesures?)\b/); if (bars) o.bars = Number(bars[1]);
    const secs = s.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/); if (secs) o.secs = Number(secs[1]);
    if (!bars && !secs) { const n = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/); if (n) o.n = Number(n[1]); }
    if (/\b(off|stop|undo|no loop)\b/.test(s)) o.off = true;
    if (/\b(check|seamless\??|test)\b/.test(s)) o.check = true;
    if (/\b(render|export|mp4|gif)\b/.test(s)) o.render = /\bgif\b/.test(s) ? 'gif' : 'loop';
    if (/\b(no blend|no fade|without (?:a |the )?(?:blend|fade|cross-?fade)|blend off|fade off)\b/.test(s)) o.fade = false;
    else if (/\b(blend|fade|cross-?fade)\b/.test(s)) o.fade = true;
    if (/\bstatus\b/.test(s)) o.status = true;
    return o;
  }

  // ---------- the clock ----------
  const fold = (t, a, len) => (len > 0 ? a + ((((t - a) % len) + len) % len) : t);
  const whole = (n) => Math.round(Number(n)) || 1;
  const phase = (t, a, len, n = 1) => { const u = len > 0 ? ((((t - a) / len) % 1) + 1) % 1 : 0; return n === 1 ? u : (u * whole(n)) % 1; };
  // the export page's frame n of a loop of L frames from T0 (wrap: frames past the end come round to the start; renders
  // and the check don't: a blend's frames past the end are what the scene does next)
  const frameTime = (n, { T0 = 0, F = 30, L = 0, wrap = false } = {}) => r4(T0 + ((wrap && L > 0 ? n % L : n) / F));

  // ---------- keyframes (props.keys: { prop: [{ t, v, ease, c? }] }) ----------
  const mixHex = (a, b, u) => { const pa = parseInt(a.slice(1), 16); const pb = parseInt(b.slice(1), 16); const ch = (sh) => clamp(Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * u)), 0, 255); return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`; };
  const EASE = {
    linear: (u) => u, ease: (u) => u * u * (3 - 2 * u), in: (u) => u ** 3, out: (u) => 1 - (1 - u) ** 3, inOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
    quadIn: (u) => u * u, quadOut: (u) => 1 - (1 - u) * (1 - u), sineIn: (u) => 1 - Math.cos((u * Math.PI) / 2), sineOut: (u) => Math.sin((u * Math.PI) / 2), sineInOut: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    smoother: (u) => u * u * u * (u * (u * 6 - 15) + 10),
  };
  // the value of a setting's keys at t (the Lab's rules: before the first / after the last key it holds)
  function valueAt(keys, t) {
    if (!keys?.length) return undefined;
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
    const a = keys[i]; const b = keys[i + 1];
    if (a.ease === 'hold') return a.v;
    let u = (t - a.t) / (b.t - a.t || 1);
    if (a.ease === 'curve' && a.c) u = a.c > 0 ? u ** (1 + a.c * 4) : 1 - (1 - u) ** (1 - a.c * 4);
    else u = (EASE[a.ease] || EASE.ease)(u);
    if (typeof a.v === 'string' && typeof b.v === 'string') return mixHex(a.v, b.v, u);
    return a.v + (b.v - a.v) * u;
  }
  const same = (x, y) => (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x)) : String(x).toLowerCase() === String(y).toLowerCase());
  // keys that come back to the start value at the loop's end: a key at a + len with the value at a (the keys past it
  // are never reached inside the loop and go). null: they already come back.
  function close(keys, a, len) {
    if (!keys?.length || !(len > 0)) return null;
    const end = r3(a + len);
    const v0 = valueAt(keys, a); const v1 = valueAt(keys, end);
    if (same(v0, v1)) return null;
    const inside = keys.filter((k) => k.t < end - 1e-4).map((k) => ({ ...k }));
    // the loop starts between two keys: a key there holds its value, so the new end key doesn't change the start
    if (!inside.some((k) => Math.abs(k.t - a) < 1e-4)) {
      const before = inside.filter((k) => k.t < a).pop();
      inside.push({ t: r3(a), v: v0, ease: before?.ease && before.ease !== 'hold' ? before.ease : 'ease' });
      inside.sort((x, y) => x.t - y.t);
    }
    const prev = inside[inside.length - 1];
    return [...inside, { t: end, v: v0, ease: prev.ease === 'hold' ? 'ease' : prev.ease || 'ease' }];
  }

  // ---------- the seamless check ----------
  // frames: small gray frames (Uint8Array, one byte a pixel) of the loop in order, frames[L] (optional) the one after
  // its end (what the scene does next: a blend's first frame). core: PublishCore (diff, seam, median).
  // → { seamless, diff, ratio, usual, blended: { seamless, … } (the end running into what follows it: the blend's
  //   first frame), again (frame L against frame 0: the scene comes back by itself) }
  function seam(frames, core, L = frames.length) {
    if (!core || L < 3) return null;
    const first = frames[0]; const last = frames[L - 1];
    const steps = []; for (let i = 1; i < L; i += 1) steps.push(core.diff(frames[i], frames[i - 1]));
    const usual = core.median(steps);
    const s = core.seam(first, last, usual);
    const after = frames[L] || null;
    const bl = after ? core.seam(after, last, usual) : null;
    return { ...s, usual: r4(usual), blended: bl, again: after ? r4(core.diff(after, first)) : null };
  }
  function verdict(r, fade = false) {
    if (!r) return { state: 'unknown', text: 'Not checked yet' };
    if (r.seamless) return { state: 'ok', text: '≈ seamless', detail: `the last frame runs into the first like any two frames (${r.ratio}× the usual change)` };
    if (fade && (typeof r.blended === 'object' ? r.blended?.seamless : r.blended)) return { state: 'ok', text: '≈ seamless (blended)', detail: `the last beat blends into the first: without it, a jump of ${r.ratio}× the usual change` };
    return { state: 'jump', text: 'a visible jump', detail: `the last frame → the first changes ${r.ratio}× more than two frames usually do` };
  }
  // the director's brief when the code itself has to come round (only on a click or the mission; cost shown first)
  function brief({ len, kind, bars, verdictText, words = '' }) {
    return `∞ Mission: make it loop perfectly over ${kind === 'bars' ? `${bars} bar${bars === 1 ? '' : 's'}` : `${len} s`} (the Lab already loops the timeline there; the check says: ${verdictText}). Make the motion periodic: drive it with loopT() / loopSin(n) / loopCos(n) / loopAngle(n) and loopNoise(x, y) instead of time that keeps growing, whole numbers of turns and waves, no state that drifts (help loop). Keep the look.${words ? `\n\n${words}` : ''}`;
  }
  const cost = (text) => Math.ceil(String(text || '').length / 3.6);
  const label = (p) => (!p ? '' : p.kind === 'bars' ? `${p.bars} bar${p.bars === 1 ? '' : 's'} (${(Math.round(p.len * 10) / 10)} s)` : `${Math.round(p.len * 10) / 10} s`);

  return { BARS, SECS, barLen, plan, parse, fold, phase, frameTime, valueAt, close, seam, verdict, brief, cost, label };
})();
if (typeof module !== 'undefined') module.exports = LoopCore;
