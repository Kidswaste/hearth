// 🎥 Camera moves (round 40, labcamera): the math, without the DOM. A camera move is a keyframed offset on a layer's
// own 3D camera over a time range of the scene's clock (its song, else its own timeline): push in, pull out, orbit,
// dolly zoom, crane, handheld shake, whip pan, slow drift, a punch-in on each kick / beat / bar, or "from this view to
// that view" (two views set with the Lab's look-around gestures). Moves are stored on the layer (`layer.camMoves`, saved
// with the scene, its templates and packs); the preview computes the camera from the time alone, so a render is the
// same every time, and the Lab sequence / exports carry them (times shifted with the clip).
// The offset is the one the look-around gestures use (tools/three-sandbox.html lvApply: turn around a pivot `d` in front
// of the camera, distance factor `s`, pivot shift px / py / pz in the camera's right / up / forward), plus a turn in
// place (lyaw, lpitch, roll) and the lens (tk: tan(fov / 2) factor, for the dolly zoom).
// It runs in three places from this one file: the Lab (CamCore: the menu, the card, the timeline, /camera-move), the
// preview page (sent as source on first use: tools/three.js sandboxFrame 'lib-need' → globalThis.camcore) and Node
// (dev/labcamera-test.js).
function hearthCamCore() {
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  // ---------- easing presets (what the move does between its two ends) ----------
  const EASES = [
    { id: 'smooth', name: 'Smooth', hint: 'eases in and out' },
    { id: 'cine', name: 'Cinematic', hint: 'a long, soft start and landing' },
    { id: 'in', name: 'Slow start', hint: 'gathers speed' },
    { id: 'out', name: 'Slow end', hint: 'lands softly' },
    { id: 'linear', name: 'Steady', hint: 'the same speed all along' },
    { id: 'snap', name: 'Snappy', hint: 'fast, with a little overshoot' },
  ];
  const EASE = Object.fromEntries(EASES.map((e) => [e.id, e]));
  function ease(id, u) {
    u = clamp(u, 0, 1);
    switch (id) {
      case 'linear': return u;
      case 'in': return u * u * u;
      case 'out': return 1 - (1 - u) ** 3;
      case 'cine': return u * u * u * (u * (u * 6 - 15) + 10); // (smootherstep: zero speed and acceleration at both ends)
      case 'snap': { const c = 1.70158 * 0.6; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; }
      default: return -(Math.cos(Math.PI * u) - 1) / 2;
    }
  }
  // ---------- the presets ----------
  // travel: the move goes from "as the scene has it" to its end and holds there after its range (moves in sequence add
  // up: a push in then a pull out comes back). Transient ones (shake, whip, punch) are only felt inside their range.
  const KINDS = [
    { id: 'push', name: 'Push in', icon: '⇥', travel: true, hint: 'moves toward the subject', words: 'push in dolly in closer zoom in approach' },
    { id: 'pull', name: 'Pull out', icon: '⇤', travel: true, hint: 'moves away, revealing more', words: 'pull out dolly out back away reveal zoom out wide' },
    { id: 'orbit', name: 'Orbit', icon: '↻', travel: true, hint: 'circles around the subject', words: 'orbit circle around turntable arc rotate spin' },
    { id: 'dolly', name: 'Dolly zoom', icon: '⧖', travel: true, hint: 'the vertigo shot: the subject stays, the world stretches', words: 'dolly zoom vertigo hitchcock zolly contra zoom' },
    { id: 'crane', name: 'Crane', icon: '⇡', travel: true, hint: 'rises over the subject (or comes down)', words: 'crane up down jib rise boom pedestal tilt over above' },
    { id: 'drift', name: 'Slow drift', icon: '〜', travel: true, hint: 'a slow, almost still float', words: 'slow drift float gentle subtle breathe ambient' },
    { id: 'shake', name: 'Handheld shake', icon: '≋', travel: false, hint: 'a subtle handheld feel', words: 'handheld shake hand held camera shake wobble jitter documentary' },
    { id: 'whip', name: 'Whip pan', icon: '⟿', travel: false, hint: 'a fast swing away and back', words: 'whip pan swish fast swing transition' },
    { id: 'punch', name: 'Punch-in on the beat', icon: '✸', travel: false, hint: 'a quick push on each kick / beat / bar', words: 'punch in on the beat kick bar bump zoom pulse thump beat sync music' },
    { id: 'views', name: 'From this view to that view', icon: '⇢', travel: true, hint: 'two views you set by looking around', words: 'from this view to that view keyframe start end camera path a to b' },
  ];
  const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const BANDS = [{ id: 'kick', name: 'each kick' }, { id: 'beat', name: 'each beat' }, { id: 'bar', name: 'each bar' }];
  const VKEYS = ['yaw', 'pitch', 's', 'px', 'py', 'pz'];

  // ---------- a move ----------
  let seq = 0;
  const newId = () => `cm${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;
  // { id, kind, t0, t1 (scene seconds), ease, amt (intensity 0..2, 1 = the preset), d (pivot distance), dir (+1 / −1:
  // right / up / out, left / down / in), turns (orbit: 0.25 · 0.5 · 1), band (punch: kick · beat · bar), from / to (views:
  // { yaw, pitch, s, px, py, pz }), seed (shake) }
  function make(kind, o = {}) {
    const K = KIND[kind]; if (!K) throw new Error(`Moves: ${KINDS.map((k) => k.id).join(', ')}`);
    const t0 = Math.max(0, Number(o.t0) || 0); const t1 = Math.max(t0 + 0.05, Number(o.t1) || t0 + 4);
    const m = { id: o.id || newId(), kind, t0: r4(t0), t1: r4(t1), ease: EASE[o.ease] ? o.ease : kind === 'drift' || kind === 'views' ? 'cine' : 'smooth', amt: clamp(Number(o.amt ?? 1) || 0, 0, 2), d: Number(o.d) > 0 ? r4(Number(o.d)) : 5 };
    if (/^(orbit|crane|whip|drift|dolly)$/.test(kind)) m.dir = Number(o.dir) < 0 ? -1 : 1;
    if (kind === 'orbit') m.turns = [0.25, 0.5, 1].includes(Number(o.turns)) ? Number(o.turns) : 0.25;
    if (kind === 'punch') m.band = BANDS.some((b) => b.id === o.band) ? o.band : 'kick';
    if (kind === 'shake') m.seed = Number(o.seed) || 1;
    if (kind === 'views') { m.from = view(o.from); m.to = view(o.to); }
    return m;
  }
  const view = (v) => Object.fromEntries(VKEYS.map((k) => [k, Number.isFinite(Number(v?.[k])) ? Number(v[k]) : k === 's' ? 1 : 0]));
  // a move as read (a saved scene, a pack, a recipe): cleaned, or null
  function clean(m) {
    if (!m || typeof m !== 'object' || !KIND[m.kind]) return null;
    try { return make(m.kind, m); } catch { return null; }
  }
  const cleanAll = (list) => (Array.isArray(list) ? list.map(clean).filter(Boolean).slice(0, 64) : []);

  // ---------- what a move does at time t ----------
  // a smooth, repeatable wobble (sums of sines at unrelated rates, phases from the seed): -1..1-ish
  function noise(t, seed = 1, ch = 0) {
    const p = seed * 12.9898 + ch * 78.233;
    const ph = (k) => ((Math.sin(p * (k + 1)) * 43758.5453) % 1) * TAU;
    return 0.5 * Math.sin(t * 1.31 * TAU + ph(0)) + 0.3 * Math.sin(t * 2.17 * TAU + ph(1)) + 0.2 * Math.sin(t * 3.73 * TAU + ph(2));
  }
  // a punch after a hit dt seconds ago: up in 30 ms, back down over ~0.2 s (0 before the hit)
  function punchEnv(dt) {
    if (dt == null || !(dt >= 0)) return 0;
    if (dt < 0.03) return dt / 0.03;
    return Math.exp(-(dt - 0.03) / 0.16);
  }
  // a whip: out to the side fast, then back (an expo ease each way)
  const expo = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2);
  const whipShape = (u) => (u < 0.5 ? expo(u * 2) : expo((1 - u) * 2));
  const progress = (m, t) => clamp((t - m.t0) / Math.max(1e-6, m.t1 - m.t0), 0, 1);
  // the offset an identity starts from
  const zero = () => ({ yaw: 0, pitch: 0, s: 1, px: 0, py: 0, pz: 0, lyaw: 0, lpitch: 0, roll: 0, tk: 1, d: 5 });
  // add one move's part at t into O. since(band) → seconds since that band's last hit (the song's clock), or null
  function addMove(O, m, t, since) {
    const a = m.amt ?? 1; const dir = m.dir || 1;
    const K = KIND[m.kind]; if (!K) return;
    if (!K.travel && (t < m.t0 || t > m.t1)) return;
    const u = ease(m.ease, progress(m, t));
    switch (m.kind) {
      case 'push': O.s *= Math.exp(-0.55 * a * u); break;
      case 'pull': O.s *= Math.exp(0.55 * a * u); break;
      case 'orbit': O.yaw += dir * (m.turns || 0.25) * TAU * a * u; break;
      case 'dolly': { const k = Math.exp(dir * 0.7 * a * u); O.s *= k; O.tk /= k; break; }
      case 'crane': O.pitch -= dir * 0.42 * a * u; break;
      case 'drift': O.yaw += dir * 0.16 * a * u; O.pitch -= 0.05 * a * u; O.s *= Math.exp(-0.08 * a * u); break;
      case 'views': {
        const f = m.from || {}; const g = m.to || {};
        for (const k of ['yaw', 'pitch', 'px', 'py', 'pz']) O[k] += (f[k] || 0) + ((g[k] || 0) - (f[k] || 0)) * u;
        O.s *= Math.exp(Math.log(Math.max(1e-3, f.s || 1)) * (1 - u) + Math.log(Math.max(1e-3, g.s || 1)) * u);
        break;
      }
      case 'shake': {
        // fades in and out over a quarter second (or a quarter of a short range): no jolt where it starts
        const edge = Math.min(0.25, (m.t1 - m.t0) / 4);
        const env = clamp(Math.min(t - m.t0, m.t1 - t) / Math.max(1e-6, edge), 0, 1);
        const k = 0.012 * a * env; const sd = m.seed || 1;
        O.lyaw += k * noise(t, sd, 0); O.lpitch += k * 0.8 * noise(t, sd, 1); O.roll += k * 0.5 * noise(t, sd, 2);
        O.py += k * 0.6 * m.d * noise(t * 0.7, sd, 3) * 0.1;
        break;
      }
      case 'whip': O.lyaw -= dir * 1.1 * a * whipShape(progress(m, t)); break;
      case 'punch': { const e = punchEnv(since ? since(m.band || 'kick') : null); if (e > 0) O.s *= Math.exp(-0.14 * a * e); break; }
      default: break;
    }
  }
  // all of a layer's moves at t: the offset, or null when nothing moves (the scene's camera as it is)
  function at(moves, t, { since = null } = {}) {
    if (!moves?.length || t == null || !Number.isFinite(t)) return null;
    const O = zero();
    O.d = moves.find((m) => m.d > 0)?.d || 5;
    for (const m of moves) addMove(O, m, t, since);
    O.s = clamp(O.s, 0.02, 50); O.tk = clamp(O.tk, 0.02, 50);
    // (moves that cancel out, a push in then a pull out, land on the scene's camera exactly, not 1e-16 off it)
    for (const k of ['yaw', 'pitch', 'px', 'py', 'pz', 'lyaw', 'lpitch', 'roll']) if (Math.abs(O[k]) < 1e-12) O[k] = 0;
    if (Math.abs(O.s - 1) < 1e-12) O.s = 1;
    if (Math.abs(O.tk - 1) < 1e-12) O.tk = 1;
    return identity(O) ? null : O;
  }
  const identity = (O) => !O || (O.yaw === 0 && O.pitch === 0 && O.s === 1 && O.px === 0 && O.py === 0 && O.pz === 0 && O.lyaw === 0 && O.lpitch === 0 && O.roll === 0 && O.tk === 1);
  // hit times → since(t): seconds since the last hit at or before t (null before the first)
  function sinceOf(times) {
    const T = (times || []).slice().sort((x, y) => x - y);
    return (t) => { let lo = 0; let hi = T.length - 1; let k = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (T[mid] <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; } return k < 0 ? null : t - T[k]; };
  }

  // ---------- editing ----------
  // moves for a clip of a sequence: the scene's time k lands at t0 + k / rate
  const shift = (moves, dt, rate = 1) => (moves || []).map((m) => ({ ...m, t0: r4(m.t0 / rate + dt), t1: r4(m.t1 / rate + dt) }));
  // one end dragged (or the whole move: edge 'both'), kept inside [0, len] and at least min long
  function moveEdge(m, edge, t, { len = Infinity, min = 0.1, from = null } = {}) {
    const n = { ...m };
    if (edge === 'a') n.t0 = r4(clamp(t, 0, n.t1 - min));
    else if (edge === 'b') n.t1 = r4(clamp(t, n.t0 + min, len));
    else { const w = m.t1 - m.t0; const t0 = clamp((from ?? m.t0) + t, 0, Math.max(0, len - w)); n.t0 = r4(t0); n.t1 = r4(t0 + w); }
    return n;
  }
  // where a new move goes: the whole scene, the loop, 4 bars from the playhead, or right after the last move
  function rangeFor(when, { len = 10, now = 0, loop = null, bar = 2, moves = [] } = {}) {
    const L = len > 0 ? len : 10;
    if (when === 'loop' && loop && loop.b > loop.a) return [loop.a, loop.b];
    if (when === 'here') return [clamp(now, 0, Math.max(0, L - 0.1)), Math.min(L, now + 4 * (bar > 0 ? bar : 2))];
    if (when === 'after' && moves.length) { const e = Math.max(...moves.map((m) => m.t1)); if (e < L - 0.1) return [e, Math.min(L, e + 4 * (bar > 0 ? bar : 2))]; }
    return [0, L];
  }

  // ---------- plain words ----------
  const dirWord = (m) => (m.kind === 'crane' ? (m.dir < 0 ? 'down' : 'up') : m.kind === 'dolly' ? (m.dir < 0 ? 'in' : 'out') : m.dir < 0 ? 'left' : 'right');
  const TURNS = { 0.25: '¼', 0.5: '½', 1: 'full' };
  function name(m) {
    const K = KIND[m?.kind]; if (!K) return 'Camera move';
    switch (m.kind) {
      case 'orbit': return `Orbit ${dirWord(m)} ${TURNS[m.turns] || '¼'}`;
      case 'crane': return `Crane ${dirWord(m)}`;
      case 'whip': return `Whip pan ${dirWord(m)}`;
      case 'dolly': return `Dolly zoom ${dirWord(m)}`;
      case 'drift': return 'Slow drift';
      case 'punch': return `Punch-in on ${BANDS.find((b) => b.id === m.band)?.name || 'each kick'}`;
      case 'views': return 'From one view to another';
      default: return K.name;
    }
  }
  const fmtT = (s) => { const m = Math.floor(s / 60); const x = s - m * 60; return `${m}:${x < 10 ? '0' : ''}${x.toFixed(1)}`; };
  const describe = (m) => `${KIND[m.kind]?.icon || '🎥'} ${name(m)} · ${fmtT(m.t0)}–${fmtT(m.t1)} · ${EASE[m.ease]?.name || 'Smooth'}${Math.abs((m.amt ?? 1) - 1) > 0.01 ? ` · ${Math.round((m.amt ?? 1) * 100)} %` : ''}`;
  // typed words → { kind, dir, turns, band, ease, when, amt } (null kind: not understood)
  function parse(text) {
    const s = ` ${String(text || '').toLowerCase()} `;
    const has = (re) => re.test(s);
    let kind = null;
    if (has(/\b(punch|bump)\b|on the (beat|kick|bar)|each (kick|beat|bar)/)) kind = 'punch';
    else if (has(/dolly ?zoom|vertigo|zolly|hitchcock/)) kind = 'dolly';
    else if (has(/\bviews?\b|from this|a to b/)) kind = 'views';
    else if (has(/\bwhip|swish/)) kind = 'whip';
    else if (has(/\bshake|handheld|hand-held|wobble|jitter/)) kind = 'shake';
    else if (has(/\bdrift|float/)) kind = 'drift';
    else if (has(/\b(crane|jib|boom|rise|pedestal)\b/)) kind = 'crane';
    else if (has(/\borbit|circle|around|turntable|arc\b/)) kind = 'orbit';
    else if (has(/\bpull|dolly out|zoom out|back\b|away|reveal/)) kind = 'pull';
    else if (has(/\bpush|dolly in|zoom in|closer|in\b/)) kind = 'push';
    const o = { kind };
    if (has(/\bleft|counter|\bccw\b/)) o.dir = -1; else if (has(/\bright|clockwise|\bcw\b/)) o.dir = 1;
    if (kind === 'crane') o.dir = has(/\bdown|lower|descend/) ? -1 : 1;
    if (kind === 'dolly') o.dir = has(/\bin\b/) && !has(/\bout\b/) ? -1 : 1;
    if (kind === 'orbit') o.turns = has(/\bfull|360|whole turn|1 turn|all the way/) ? 1 : has(/\bhalf|½|180/) ? 0.5 : 0.25;
    if (kind === 'punch') o.band = has(/\bbar/) ? 'bar' : has(/\bbeat/) && !has(/\bkick/) ? 'beat' : 'kick';
    // ("in" / "out" alone are the move's words: "push in"; the easing is "ease in", "slow start"…)
    for (const e of EASES) if (s.includes(` ${e.name.toLowerCase()} `) || (!/^(in|out)$/.test(e.id) && s.includes(` ${e.id} `)) || s.includes(` ease ${e.id} `) || s.includes(` ease-${e.id} `)) o.ease = e.id;
    const w = /\b(whole|loop|here|after)\b/.exec(s); if (w) o.when = w[1];
    const pc = /(\d{1,3})\s*%/.exec(s); if (pc) o.amt = clamp(Number(pc[1]) / 100, 0, 2);
    const rg = /(\d+(?:\.\d+)?)\s*s?\s*(?:to|-|–|\.\.)\s*(\d+(?:\.\d+)?)\s*s\b/.exec(s); if (rg) { o.t0 = Number(rg[1]); o.t1 = Number(rg[2]); }
    return o;
  }
  return { KINDS, KIND, EASES, EASE, BANDS, VKEYS, ease, make, clean, cleanAll, noise, punchEnv, whipShape, progress, at, addMove, identity, zero, sinceOf, shift, moveEdge, rangeFor, name, describe, parse, fmtT };
}
const CamCore = hearthCamCore();
// the preview page gets the factory as source (tools/three.js sandboxLib: it runs `(code)()` as a module there)
if (typeof window !== 'undefined') (window.__sbxLibFn ||= {}).camcore = { toString: () => `function () { globalThis.camcore = (${hearthCamCore})(); }` };
if (typeof module !== 'undefined') module.exports = { ...CamCore, factory: hearthCamCore };
