// ✎ Camera paths (round 133, campath133): the pure part (no window, loads in Node too). docs/upgrades/campath133.md
// A path is one 🎥 camera move of kind 'path' (tools/three-camera-core.js: its points are keyframes { t, v: view } and
// the camera at t is CamCore.pathView). This file decides WHEN each point plays and WHERE it is drawn on the preview:
//   ranges(input)          → [{ id, name, a, b }]: the whole song, the loop, each section (songmap130's cues, else the
//                             song's analysed sections)       input: { duration, loop, cues, sections, grid }
//   times(n, o)            → n key times in [a, b], spread evenly, snapped to bars or one per section
//                             o: { a, b, snap: 'bars' | 'sections' | 'off', grid: { bpm, downbeat, beatsPerBar }, sections }
//   plan(v, box) / unplan  → a point's dot on the preview: the subject in the middle, the camera's spot seen from above
//                             and in front (a ground ellipse), so an orbit draws a ring; unplan keeps the point's height
//   curve(m, box, n)       → the drawn curve: n samples of the move's own pathView (the same curve the camera follows)
//   parse(words)           → a path from words (/camera-moves path …, for chats and the directors)
const CamPathCore = (() => {
  const CC = () => (typeof CamCore !== 'undefined' ? CamCore : typeof require === 'function' ? require('./three-camera-core.js') : null);
  const r4 = (x) => Math.round(Number(x) * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TAU = Math.PI * 2;

  // ---------- the bars and the sections ----------
  function barsOf(grid) {
    const bpm = Number(grid?.bpm) || 0; if (!bpm) return null;
    const bar = ((Number(grid.beatsPerBar) || 4) * 60) / bpm;
    const a = Number(grid.downbeat) || 0;
    return { bar, beat: 60 / bpm, snap: (t) => a + Math.round((t - a) / bar) * bar };
  }
  // sections: the timeline's cues when there are some (✦ Map to the song / Mark sections put them on the downbeats),
  // else the analysed sections as songmap130 names them (sectionsOf: "Drop 2" for the second drop)
  function sectionsOf(input) {
    const dur = Number(input.duration) || 0;
    const cues = (input.cues || []).filter((c) => Number.isFinite(Number(c.time ?? c.t))).map((c) => ({ name: String(c.name || 'Cue'), start: Number(c.time ?? c.t) })).sort((x, y) => x.start - y.start);
    let list = cues;
    if (!list.length && input.sections?.length) {
      const SM = typeof SongMapCore !== 'undefined' ? SongMapCore : null;
      list = SM ? SM.sectionsOf({ duration: dur, grid: input.grid, sections: input.sections }).list.map((s) => ({ name: s.name, start: s.start })) : input.sections.map((s, i) => ({ name: s.label || `Section ${i + 1}`, start: Number(s.start) || 0 }));
    }
    return list.map((s, i) => ({ name: s.name, start: r4(s.start), end: r4(list[i + 1]?.start ?? dur) })).filter((s) => s.end > s.start + 0.1);
  }
  function ranges(input) {
    const dur = Number(input.duration) || 10;
    const out = [{ id: 'whole', name: 'The whole song', a: 0, b: r4(dur) }];
    if (input.loop && input.loop.b > input.loop.a) out.push({ id: 'loop', name: 'The loop', a: r4(input.loop.a), b: r4(input.loop.b) });
    sectionsOf(input).forEach((s, i) => out.push({ id: `s${i}`, name: s.name, a: s.start, b: s.end, section: true }));
    return out;
  }
  // a range named in words ("the drop", "drop 2", "the loop", "the whole song")
  function rangeNamed(list, words) {
    const w = ` ${String(words || '').toLowerCase()} `;
    if (/\bloop\b/.test(w)) return list.find((r) => r.id === 'loop') || null;
    const secs = list.filter((r) => r.section).sort((a, b) => b.name.length - a.name.length); // ("drop 2" before "drop")
    for (const r of secs) if (new RegExp(`\\b${r.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(w)) return r;
    if (/\b(whole|all|entire|full) (song|track|scene)\b/.test(w)) return list[0];
    return null;
  }

  // ---------- when each point plays ----------
  function times(n, o = {}) {
    const a = Number(o.a) || 0; const b = Math.max(a + 0.1, Number(o.b) || a + 4);
    if (n <= 1) return [r4(a)];
    const even = (i) => a + ((b - a) * i) / (n - 1);
    if (o.snap === 'sections') {
      const cand = [...new Set([a, ...(o.sections || []).map((s) => s.start).filter((t) => t > a + 0.05 && t < b - 0.05), b].map(r4))].sort((x, y) => x - y);
      if (cand.length >= n) return Array.from({ length: n }, (_, i) => cand[Math.round((i * (cand.length - 1)) / (n - 1))]);
    }
    const B = (o.snap === 'bars' || o.snap === 'sections') ? barsOf(o.grid) : null;
    const out = [];
    for (let i = 0; i < n; i += 1) {
      let t = even(i);
      if (B) { const s = B.snap(t); const s2 = s < a - 1e-6 ? s + B.bar : s > b + 1e-6 ? s - B.bar : s; if (s2 >= a - 1e-6 && s2 <= b + 1e-6) t = s2; }
      if (out.length && t <= out[out.length - 1] + 0.02) t = B && out[out.length - 1] + B.bar <= b + 1e-6 ? out[out.length - 1] + B.bar : Math.max(even(i), out[out.length - 1] + 0.05);
      out.push(r4(t));
    }
    return out;
  }

  // ---------- where a point is drawn: the camera's spot around the subject ----------
  // box: { cx, cy, R } (the preview's middle and the ring's radius in px). X: right, Z: towards the viewer, H: up
  const K_Z = 0.45; const K_H = 0.9;
  function world(v) {
    const s = Number(v.s) || 1; const p = Number(v.pitch) || 0; const y = Number(v.yaw) || 0;
    return { X: s * Math.cos(p) * Math.sin(y) + (v.px || 0), Z: s * Math.cos(p) * Math.cos(y) - (v.pz || 0), H: -s * Math.sin(p) + (v.py || 0) };
  }
  function plan(v, box) { const w = world(v); return { x: r4(box.cx + box.R * w.X), y: r4(box.cy + box.R * (K_Z * w.Z - K_H * w.H)) }; }
  // a dot dragged to (x, y): the camera moves around the subject at the same height (yaw and distance change)
  function unplan(x, y, v, box) {
    const w = world(v); const hh = w.H - (v.py || 0);
    const X = (x - box.cx) / box.R - (v.px || 0);
    const Z = ((y - box.cy) / box.R + K_H * w.H) / K_Z + (v.pz || 0);
    const flat = Math.max(0.05, Math.hypot(X, Z));
    let yaw = Math.atan2(X, Z);
    const y0 = Number(v.yaw) || 0; yaw += Math.round((y0 - yaw) / TAU) * TAU; // (the turn nearest the point's own)
    const s = Math.hypot(flat, hh);
    return { ...v, yaw: r4(yaw), s: r4(clamp(s, 0.05, 50)), pitch: r4(Math.atan2(-hh, flat)) };
  }
  function curve(m, box, n = 72) {
    const C = CC(); const out = [];
    for (let i = 0; i <= n; i += 1) { const t = m.t0 + ((m.t1 - m.t0) * i) / n; out.push(plan(C.pathView(m, t), box)); }
    return out;
  }

  // ---------- words: /camera-moves path … ----------
  // "path 0 0 1, 90 -15 0.7, 180 0 1.2 over the drop snap bars hold kick 40%": points as yaw° pitch° distance (1 = the
  // scene's camera), or presets: "push in", "orbit right half", "crane up" read as 2-3 points
  function parse(words) {
    const s = ` ${String(words || '').toLowerCase()} `;
    const o = { pts: [], how: /\bhold\b/.test(s) ? 'hold' : /\blinear|straight\b/.test(s) ? 'linear' : 'smooth', snap: /\bsnap (to )?sections?\b|\bper section\b|\beach section\b/.test(s) ? 'sections' : /\b(no snap|snap off|unsnapped)\b/.test(s) ? 'off' : 'bars' };
    if (/\bshake\b/.test(s)) { const k = /(\d{1,3})\s*%/.exec(s); o.kick = k ? clamp(Number(k[1]) / 100, 0, 1) : 0.5; }
    const nums = /\bpath\b([-\d.,\s;|]+)/.exec(s);
    if (nums) for (const part of nums[1].split(/[,;|]/)) { const x = part.trim().split(/\s+/).map(Number).filter(Number.isFinite); if (x.length) o.pts.push({ yaw: (x[0] * Math.PI) / 180, pitch: ((x[1] || 0) * Math.PI) / 180, s: x[2] > 0 ? x[2] : 1, px: 0, py: 0, pz: 0 }); }
    return o;
  }

  return { barsOf, sectionsOf, ranges, rangeNamed, times, world, plan, unplan, curve, parse };
})();
if (typeof module !== 'undefined') module.exports = CamPathCore;
