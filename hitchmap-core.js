// ▶ Play's hitch map (round 63, hitchmap63), the pure part: the hub window loads it as a script (global HitchMapCore,
// lazy group "gamemode"), hitchmapmain.js require()s it, dev/hitchmap-test.js runs it in Node.
// The recorder in the game window (tools/hitchmap-page.js) keeps, per frame, the frame's time and where the player and
// the camera were; after the session this turns that trace into the map:
//   decode(dump)           the page's dump() (JSON, the ring as base64) → { a: Float32Array, n, cols, … }
//   axes(a, n)             the two axes the player moved along most (x / z for a 3D game, x / y for a 2D one) → [0, 2]
//   grid(a, n, o)          the top-down heatmap: cells of the play area, each with its frames, mean / worst frame time and
//                          hitches → { w, h, ax, bounds, cells: { n, mean, max, hitches } (flat arrays) }
//   timeline(a, n, o)      the session in ≤ 400 buckets: mean and worst frame time each
//   spots(a, n, o)         the worst places: hitch frames clustered by where they happened, ranked by time lost
//                          (Σ of each hitch's time over the usual frame) → [{ x, y, z, cam, worst, t, n, lost, typical, … }]
//   attribute(spots, …)    GamePerf's slow frames (when the probe was attached) matched by time: each spot's causes
//   build(trace, o)        everything above in one summary (what hitchmapmain.js saves per game)
//   line(spot) / brief(map) / draft(map, i, game)   plain words; the Three Director's task (drafted, never sent)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HitchMapCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const COLS = 8; const T = 0; const DT = 1; const PX = 2; const CX = 5;
  const GRID = 40; const MAX_SPOTS = 8; const BUCKETS = 400;
  const AX = ['x', 'y', 'z'];

  // ---------- the trace ----------
  function b64(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(s || ''), 'base64'));
    const bin = atob(String(s || '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i); return u;
  }
  function decode(dump) {
    const d = typeof dump === 'string' ? JSON.parse(dump) : dump;
    if (!d || d.v !== 1 || (d.cols || COLS) !== COLS) return null;
    const u = b64(d.data);
    const n = Math.min(Number(d.n) || 0, Math.floor(u.byteLength / (COLS * 4)));
    const a = new Float32Array(n * COLS);
    new Uint8Array(a.buffer).set(u.subarray(0, n * COLS * 4)); // (a copy: aligned for the floats)
    const { data, ...meta } = d;
    return { ...meta, a, n };
  }
  // a trace from plain rows (tests, fixtures): [[t, dt, px, py, pz, cx, cy, cz], …]
  function fromRows(rows) { const a = new Float32Array(rows.length * COLS); rows.forEach((r, i) => { for (let k = 0; k < COLS; k += 1) a[i * COLS + k] = Number(r[k]) || 0; }); return { a, n: rows.length }; }
  // the frames that count: a gap over 5 s is a pause (the window hidden, the machine asleep), not a hitch
  const counts = (a, i) => a[i * COLS + DT] > 0 && a[i * COLS + DT] < 5000;

  // ---------- numbers ----------
  function quant(vals, p) { if (!vals.length) return 0; const s = Float64Array.from(vals).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; }
  function stats(a, n, hz) {
    const d = []; for (let i = 0; i < n; i += 1) if (counts(a, i)) d.push(a[i * COLS + DT]);
    const refresh = 1000 / (Number(hz) > 0 ? Number(hz) : 60);
    const typical = d.length ? quant(d, 0.5) : refresh;
    // a hitch: 1.5 × the usual frame (or the refresh, if the game runs faster than the screen shows), and at least a
    // refresh and 4 ms over it: at 240 Hz a frame of 8.3 ms (one refresh missed) is one, on a slow machine 1.5× its frame
    const hitch = Math.max(1.5 * Math.max(typical, refresh), refresh + 4);
    let sum = 0; let worst = 0; for (const x of d) { sum += x; if (x > worst) worst = x; }
    return { frames: d.length, refresh, typical, hitch, mean: d.length ? sum / d.length : 0, p95: d.length ? quant(d, 0.95) : 0, worst };
  }
  // the two axes the player moved along most (their spread: 5th to 95th percentile); kept in x, y, z order
  function axes(a, n) {
    const spread = [0, 1, 2].map((k) => { const v = []; for (let i = 0; i < n; i += 1) if (counts(a, i)) v.push(a[i * COLS + PX + k]); return v.length ? quant(v, 0.95) - quant(v, 0.05) : 0; });
    // a 3D game moves on the ground (x, z) even when it jumps: y only wins over z when z barely moves
    const order = [0, 2, 1].sort((p, q) => spread[q] - spread[p]);
    const two = order.slice(0, 2).sort((p, q) => p - q);
    return { ax: two, spread };
  }
  function bounds(a, n, ax) {
    let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
    for (let i = 0; i < n; i += 1) {
      if (!counts(a, i)) continue;
      const u = a[i * COLS + PX + ax[0]]; const v = a[i * COLS + PX + ax[1]];
      if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v;
    }
    if (!Number.isFinite(a0)) { a0 = -1; a1 = 1; b0 = -1; b1 = 1; }
    const pa = Math.max((a1 - a0) * 0.04, 0.5); const pb = Math.max((b1 - b0) * 0.04, 0.5);
    return { a0: a0 - pa, a1: a1 + pa, b0: b0 - pb, b1: b1 + pb };
  }

  // ---------- the heatmap ----------
  function grid(a, n, o = {}) {
    const ax = o.ax || axes(a, n).ax;
    const B = o.bounds || bounds(a, n, ax);
    const st = o.stats || stats(a, n, o.hz);
    const wa = B.a1 - B.a0; const wb = B.b1 - B.b0;
    const G = o.size || GRID;
    const w = wa >= wb ? G : Math.max(1, Math.round((G * wa) / wb));
    const h = wb > wa ? G : Math.max(1, Math.round((G * wb) / wa));
    const cn = new Uint32Array(w * h); const sum = new Float64Array(w * h); const max = new Float32Array(w * h); const hit = new Uint32Array(w * h);
    for (let i = 0; i < n; i += 1) {
      if (!counts(a, i)) continue;
      const c = cellOf(a[i * COLS + PX + ax[0]], a[i * COLS + PX + ax[1]], B, w, h);
      const dt = a[i * COLS + DT];
      cn[c] += 1; sum[c] += dt; if (dt > max[c]) max[c] = dt; if (dt >= st.hitch) hit[c] += 1;
    }
    const mean = new Float32Array(w * h); for (let c = 0; c < w * h; c += 1) mean[c] = cn[c] ? sum[c] / cn[c] : 0;
    return { w, h, ax, axes: [AX[ax[0]], AX[ax[1]]], bounds: B, n: cn, mean, max, hitches: hit };
  }
  function cellOf(u, v, B, w, h) {
    const i = Math.min(w - 1, Math.max(0, Math.floor(((u - B.a0) / (B.a1 - B.a0)) * w)));
    const j = Math.min(h - 1, Math.max(0, Math.floor(((v - B.b0) / (B.b1 - B.b0)) * h)));
    return j * w + i;
  }

  // ---------- the timeline ----------
  function timeline(a, n, o = {}) {
    let t1 = 0; for (let i = 0; i < n; i += 1) if (a[i * COLS + T] > t1) t1 = a[i * COLS + T];
    const k = Math.max(1, Math.min(o.buckets || BUCKETS, n));
    const span = Math.max(1, t1);
    const cn = new Uint32Array(k); const sum = new Float64Array(k); const max = new Float32Array(k);
    for (let i = 0; i < n; i += 1) {
      if (!counts(a, i)) continue;
      const b = Math.min(k - 1, Math.floor((a[i * COLS + T] / span) * k));
      const dt = a[i * COLS + DT]; cn[b] += 1; sum[b] += dt; if (dt > max[b]) max[b] = dt;
    }
    const mean = new Float32Array(k); for (let b = 0; b < k; b += 1) mean[b] = cn[b] ? sum[b] / cn[b] : 0;
    return { k, ms: span, mean, max };
  }

  // ---------- the worst spots ----------
  // the hitch frames, worst first, each the seed of a spot unless a spot already holds it (within r on the map's two
  // axes); ranked by the time lost there (Σ of each hitch's time over the usual frame)
  function spots(a, n, o = {}) {
    const st = o.stats || stats(a, n, o.hz);
    const ax = o.ax || axes(a, n).ax;
    const B = o.bounds || bounds(a, n, ax);
    const diag = Math.hypot(B.a1 - B.a0, B.b1 - B.b0);
    const r = o.radius || Math.max(diag * 0.05, 0.25);
    const hits = [];
    for (let i = 0; i < n; i += 1) if (counts(a, i) && a[i * COLS + DT] >= st.hitch) hits.push(i);
    hits.sort((p, q) => a[q * COLS + DT] - a[p * COLS + DT]);
    const S = [];
    const uv = (i) => [a[i * COLS + PX + ax[0]], a[i * COLS + PX + ax[1]]];
    for (const i of hits) {
      const [u, v] = uv(i);
      let s = null; for (const x of S) if (Math.hypot(x.u - u, x.v - v) <= r) { s = x; break; }
      if (!s) { s = { seed: i, u, v, members: [] }; S.push(s); }
      s.members.push(i);
    }
    for (const s of S) { let lost = 0; for (const m of s.members) lost += Math.max(0, a[m * COLS + DT] - st.typical); s.lost = lost; }
    S.sort((p, q) => q.lost - p.lost || a[q.seed * COLS + DT] - a[p.seed * COLS + DT]);
    const out = S.slice(0, o.max || MAX_SPOTS).map((s) => {
      const i = s.seed; const o2 = i * COLS;
      // the usual frame there (its frames that aren't hitches), against the whole session's
      let nn = 0; let sum = 0;
      for (let k = 0; k < n; k += 1) { if (!counts(a, k) || a[k * COLS + DT] >= st.hitch) continue; const [p, q] = uv(k); if (Math.hypot(p - s.u, q - s.v) <= r) { nn += 1; sum += a[k * COLS + DT]; } }
      return {
        x: r2(a[o2 + PX]), y: r2(a[o2 + PX + 1]), z: r2(a[o2 + PX + 2]),
        cam: [r2(a[o2 + CX]), r2(a[o2 + CX + 1]), r2(a[o2 + CX + 2])],
        u: r2(s.u), v: r2(s.v), worst: r1(a[o2 + DT]), t: r1(a[o2 + T] / 1000), n: s.members.length, lost: Math.round(s.lost),
        typical: nn ? r2(sum / nn) : null, frames: nn + s.members.length,
        times: s.members.slice(0, 40).map((m) => [Math.round(a[m * COLS + T]), r1(a[m * COLS + DT])]),
      };
    });
    return { radius: r2(r), list: out, total: S.length };
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---------- why (GamePerf's slow frames, when the probe was attached) ----------
  // slows: [{ end (the frame's end on the recording's clock, ms), dt, cause, fn?, load? }]: each spot's hitches matched to
  // the probe's slow frame ending within a few ms of it
  function attribute(list, slows) {
    if (!Array.isArray(slows) || !slows.length) return list;
    for (const s of list) {
      const by = {};
      for (const [t, dt] of s.times) {
        let best = null; let bd = Infinity;
        for (const f of slows) { const d = Math.abs(f.end - t); if (d < bd) { bd = d; best = f; } }
        if (!best || bd > Math.max(4, dt * 0.25)) continue;
        const k = best.cause || 'busy';
        by[k] = (by[k] || 0) + 1;
        if (best.fn && !s.fn) s.fn = String(best.fn).slice(0, 80);
        if (best.load && !s.load) s.load = String(best.load).slice(0, 80);
      }
      if (Object.keys(by).length) s.causes = by;
    }
    return list;
  }
  const CAUSE = { gc: 'garbage collection', shader: 'a shader compile', texture: 'a texture upload', js: 'a long JS task', render: 'draw calls', layout: 'page layout', gpu: 'the graphics card', busy: 'a busy frame', 'load-late': 'a load' };
  const causeText = (c) => (c ? Object.entries(c).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${CAUSE[k] || k}${v > 1 ? ` ×${v}` : ''}`).join(', ') : '');

  // ---------- the summary ----------
  // trace: decode()'s { a, n, hz, cost, off, offAt, camKey, posFrom, shots: [[t, dt], …] }; o: { shots: [{ id, t, dt, file,
  // w, h, state, cams, pos }], slows, game, session }
  function build(trace, o = {}) {
    const { a, n } = trace; const hz = Number(trace.hz) || 60;
    const st = stats(a, n, hz);
    const { ax, spread } = axes(a, n);
    const moved = Math.max(spread[ax[0]], spread[ax[1]]) > 0.05;
    const B = bounds(a, n, ax);
    const g = grid(a, n, { ax, bounds: B, stats: st });
    const tl = timeline(a, n);
    const sp = spots(a, n, { ax, bounds: B, stats: st });
    attribute(sp.list, o.slows);
    // a spike's picture goes with the spot that holds its frame (or the nearest within the radius)
    const shots = (o.shots || []).map((x) => ({ ...x }));
    for (const s of sp.list) {
      let best = null;
      for (const x of shots) {
        const held = s.times.some(([t]) => Math.abs(t - x.t) < 1);
        const near = x.pos && Math.hypot((x.pos[AX[ax[0]]] ?? 0) - s.u, (x.pos[AX[ax[1]]] ?? 0) - s.v) <= sp.radius;
        if ((held || near) && (!best || x.dt > best.dt || (held && !best.held))) best = { ...x, held };
      }
      if (best) s.shot = best.id;
    }
    const secs = n ? a[(n - 1) * COLS + T] / 1000 : 0;
    const hitches = (() => { let k = 0; for (let i = 0; i < n; i += 1) if (counts(a, i) && a[i * COLS + DT] >= st.hitch) k += 1; return k; })();
    const arr = (x) => Array.from(x, (v) => (Number.isInteger(v) ? v : r2(v)));
    return {
      v: 1, game: o.game || null, session: o.session || 0, at: Date.now(), secs: r1(secs), frames: st.frames, hz,
      refresh: r2(st.refresh), typical: r2(st.typical), hitch: r2(st.hitch), mean: r2(st.mean), p95: r2(st.p95), worst: r1(st.worst), hitches,
      moved, posFrom: trace.posFrom || 'camera', camKey: trace.camKey || '',
      cost: trace.cost ? { ms: trace.cost.ms, frames: trace.cost.frames, perFrame: trace.cost.frames ? +(trace.cost.ms / trace.cost.frames).toFixed(5) : null } : null,
      stopped: trace.off && trace.off !== 'asked' && trace.off !== 'end' ? { by: trace.off, at: r1((trace.offAt || 0) / 1000) } : null,
      grid: { w: g.w, h: g.h, axes: g.axes, bounds: { a0: r2(B.a0), a1: r2(B.a1), b0: r2(B.b0), b1: r2(B.b1) }, n: arr(g.n), mean: arr(g.mean), max: arr(g.max), hitches: arr(g.hitches) },
      timeline: { k: tl.k, ms: Math.round(tl.ms), mean: arr(tl.mean), max: arr(tl.max) },
      radius: sp.radius,
      spots: sp.list.map((s, i) => ({ i: i + 1, ...s, times: s.times.slice(0, 12) })),
      shots: shots.map((x) => ({ id: x.id, t: r1((x.t || 0) / 1000), dt: r1(x.dt || 0), file: x.file || null, w: x.w || null, h: x.h || null, pos: x.pos || null, cams: x.cams || null, state: x.state ?? null, ...(x.stateBig ? { stateBig: true } : {}) })),
      perf: Array.isArray(o.slows) ? { slow: o.slows.length } : null,
    };
  }

  // ---------- words ----------
  function clock(secs) { const s = Math.max(0, Math.round(Number(secs) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  const n1 = (x) => (Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  const ms = (x) => (x >= 10 ? `${Math.round(x)} ms` : `${(Math.round(x * 10) / 10).toFixed(1)} ms`);
  const where = (s, m) => { const ax = m?.grid?.axes || ['x', 'z']; return `${ax[0]} ${n1(s[ax[0]] ?? s.u)}, ${ax[1]} ${n1(s[ax[1]] ?? s.v)}`; };
  function line(s, m) {
    return [`near ${where(s, m)}`, `${s.n} hitch${s.n === 1 ? '' : 'es'}, worst ${ms(s.worst)}`, s.lost >= 1000 ? `${(s.lost / 1000).toFixed(1)} s lost` : `${s.lost} ms lost`,
      s.typical != null ? `usual there ${ms(s.typical)}` : '', s.causes ? causeText(s.causes) : '', s.load ? `· ${s.load}` : ''].filter(Boolean).join(' · ');
  }
  function brief(m) {
    if (!m) return '';
    const top = m.spots && m.spots[0];
    return `${clock(m.secs)} played · ${Math.round(m.hz)} Hz · usual frame ${ms(m.typical)} · ${m.hitches} hitch${m.hitches === 1 ? '' : 'es'}${top ? ` · worst spot ${where(top, m)} (${ms(top.worst)})` : ''}`;
  }
  // the Three Director's task (drafted only, never sent)
  function draft(m, i = 1, game = {}) {
    const s = m.spots[i - 1]; if (!s) return '';
    const title = game.title || m.game?.title || 'The game';
    const sh = s.shot ? m.shots.find((x) => x.id === s.shot) : null;
    const st = sh && sh.state ? stateText(sh.state) : '';
    return [
      `Hitch map from ${title} in ▶ Play (${clock(m.secs)} played, ${Math.round(m.hz)} Hz: ${ms(m.refresh)} a frame; usual frame ${ms(m.typical)}, ${m.hitches} hitches over ${ms(m.hitch)}).`,
      `Worst spot #${s.i} of ${m.spots.length}, near ${where(s, m)} (the ${m.posFrom === 'player' ? 'player' : 'camera'}'s position): ${s.n} hitch${s.n === 1 ? '' : 'es'}, worst ${ms(s.worst)} at ${clock(s.t)}, ${s.lost} ms lost${s.typical != null ? `; usual frame there ${ms(s.typical)}` : ''}.`,
      s.causes ? `GamePerf put them down to: ${causeText(s.causes)}${s.fn ? ` (in ${s.fn})` : ''}${s.load ? `, near the load of ${s.load}` : ''}.` : '',
      `Camera there: ${s.cam.map(n1).join(', ')}.`,
      st ? `Game state then: ${st}` : '',
      'Fix this: find what the game does at that place that stalls a frame (something made, loaded, compiled or collected there), and make it smooth at 240 Hz.',
    ].filter(Boolean).join('\n');
  }
  function stateText(state, max = 8) {
    if (!state || typeof state !== 'object') return '';
    const out = [];
    const walk = (v, k, d) => {
      if (out.length >= max) return;
      if (typeof v === 'number' && Number.isFinite(v)) out.push(`${k} ${n1(v)}`);
      else if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 24)) out.push(`${k} ${v}`);
      else if (Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === 'number')) out.push(`${k} ${v.map(n1).join(',')}`);
      else if (v && typeof v === 'object' && d < 3 && !Array.isArray(v)) for (const [k2, x] of Object.entries(v).slice(0, 10)) walk(x, k ? `${k}.${k2}` : k2, d + 1);
    };
    walk(state, '', 0);
    return out.join(' · ');
  }
  // what jumping to a spot puts back: its picture's saved state and cameras when it has one, else the camera where it was
  // (looking at the player when the player was found)
  function jumpOf(m, i) {
    const s = m.spots[i - 1]; if (!s) return null;
    const sh = s.shot ? m.shots.find((x) => x.id === s.shot) : null;
    if (sh && (sh.state != null || sh.cams)) return { state: sh.state ?? null, cams: sh.cams || null, from: 'picture' };
    const key = m.camKey || 'camera';
    const look = m.posFrom === 'player' ? [s.x, s.y, s.z] : null;
    return { state: null, cams: { [key]: { p: s.cam, ...(look ? { look } : {}) } }, from: 'camera' };
  }

  return { COLS, GRID, MAX_SPOTS, decode, fromRows, stats, axes, bounds, grid, cellOf, timeline, spots, attribute, build, clock, line, brief, draft, stateText, jumpOf, causeText, CAUSE };
}));
