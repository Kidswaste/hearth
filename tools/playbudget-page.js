// ▶ Play's budget (round 55, playbudget): Hearth's own additions to the game window can never make the game run worse.
// Runs INSIDE ▶ Play's game window, FIRST in every HTML page it serves (gamemodemain.js puts its tag before the sound,
// getting-ready and loads-during-play tags; the game's files are never changed). The owner's game (Clink) on a 240 Hz
// screen has 4.2 ms a frame: Hearth's helpers in the page may take at most 2 % of that (0.1 ms at the least: the
// page's clock is in 5 µs steps) on the main thread, measured on this computer, while the game plays.
//   measure   each helper keeps one running total of the main-thread time spent in its own hooks (two
//             performance.now() reads around each, no allocation): the look (gamelook-preload.js), loads during play
//             (gamestream-page.js), the sound part (gameaudio-page.js), getting ready (gameready-page.js), the performance
//             probe (gameperf-probe.js), the stats chip (game-preload.js, told every 2 s while it shows) and this watch.
//             Work a helper only moves earlier (a shader the game's first draw would compile, a texture it would upload)
//             is the game's own and not counted. Once a second (frames counted by one frame callback of its own) the
//             totals become "ms a frame" per helper.
//   act       over the budget 3 windows in a row (≈ 3 s) → the most expensive helper still on is switched off for this
//             game (its hooks step aside, its changes put back where they cost frames: the look's shadow maps), then the
//             next if it's still over. Remembered per game (gamemodemain.js → playbudgetmain.js: the next ▶ Play starts
//             without it) and said once in plain words: the F chip's note, the performance doctor, /game helpers.
//   A/B       once while Getting ready's card shows (gameready-page.js asks): the game's own scene rendered N frames
//             with Hearth's helpers on, then stepped aside, alternating (each frame waited for to the end on the
//             graphics card, so the screen's refresh doesn't hide a difference), plus the graphics card's own time
//             (EXT_disjoint_timer_query_webgl2) where it's there. On slower beyond the noise and the budget → the
//             most expensive helper is off before the first frame of play, and the A/B again, until on ≈ off. The
//             Best look's picture (its shadow maps) is measured the same way for the doctor; whether the picture fits
//             the screen's refresh stays the look's own guard's decision (its frame gaps, gamelook-preload.js).
// Never switched off: the stats chip (you asked for it: F hides it) and this watch (≈ 1 µs a frame).
// Query: hz (the screen's refresh), t (the game's title), off (helpers remembered off for this game).
// window.__hearthBudget = { pub() → JSON, line() → 'Hearth: 0.03 ms', note() → plain words, chip(ms) → { line, note },
//   isOff(id), ab(opts) → Promise<result>, off(id, by) } (tools/game-api.md).
(function () {
  // ---------- the rules (pure; dev/playbudget-test.js) ----------
  const Rules = (() => {
    const ALL = ['look', 'stream', 'audio', 'ready', 'perf', 'chip', 'watch'];
    const ORDER = ['look', 'stream', 'perf', 'ready', 'audio']; // the ones that can be switched off (a tie: this order)
    const NAMES = { look: 'the look', stream: 'loads during play', audio: 'the sound warm-up', ready: 'getting ready', perf: 'the performance probe', chip: 'the stats chip', watch: 'this watch' };
    // 2 % of a frame at the screen's refresh, never under 0.1 ms (60 Hz: 0.33 ms, 144 Hz: 0.14 ms, 240 Hz: 0.1 ms)
    const budgetMs = (hz) => Math.max(0.1, (0.02 * 1000) / (Number(hz) > 0 ? Number(hz) : 60));
    // the most expensive helper still on (costs: id → ms a frame), or null
    function pick(costs, off) {
      let best = null; let ms = 0;
      for (const id of ORDER) { if (off && off.has(id)) continue; const v = Number(costs[id]) || 0; if (v > ms) { ms = v; best = id; } }
      return best ? { id: best, ms } : null;
    }
    const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
    // the A/B's verdict: pairs = [[on, off], …] (each a block's median ms a frame), own = the helpers' own measured time a
    // frame in the "on" blocks. Slower = the helpers' own time over the budget (measured exactly), and the frames say so
    // too: on slower in all pairs but one at most, the median difference over the budget. Both, never the frames alone:
    // a busy computer's noise must never switch a helper off for good (it's remembered for the game)
    function judge(pairs, budget, own = 0) {
      const ok = pairs.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (ok.length < 2) return { slower: false, delta: null, noise: null, pairs: ok.length };
      const d = ok.map((p) => p[0] - p[1]); const offs = ok.map((p) => p[1]);
      const delta = median(d); const noise = Math.max(...offs) - Math.min(...offs);
      const worse = d.filter((x) => x > 0).length;
      const slower = own > budget && worse >= ok.length - 1 && delta > budget;
      return { slower, delta: +delta.toFixed(4), noise: +noise.toFixed(4), own: +Number(own).toFixed(4), pairs: ok.length, worse };
    }
    const list = (ids) => { const n = ids.map((id) => NAMES[id] || id); return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };
    const note = (title, ids) => (ids.length ? `Hearth's helpers were slowing ${title || 'the game'} a little; turned off: ${list(ids)}` : '');
    const fmt = (ms) => (ms == null ? 'Hearth: –' : ms < 0.005 ? 'Hearth: < 0.01 ms' : `Hearth: ${ms.toFixed(2)} ms`);
    return { ALL, ORDER, NAMES, budgetMs, pick, median, judge, note, fmt, list };
  })();
  if (typeof module === 'object' && module && module.exports) { module.exports = Rules; return; }
  if (window.__hearthBudget) return;

  // ---------- the page ----------
  const Q = new URLSearchParams((document.currentScript && document.currentScript.src || '').split('?')[1] || '');
  const HZ = Number(Q.get('hz')) || 60;
  const TITLE = Q.get('t') || document.title || 'the game';
  const BUDGET = Rules.budgetMs(HZ);
  const SUSTAIN = 3; // windows over the budget in a row before a helper goes
  const now = () => performance.now();
  const raf = window.requestAnimationFrame.bind(window); const later = window.setTimeout.bind(window); // (the real ones: getting ready holds the game's frames)
  const t0 = now();
  const H = {}; // id → { s0, win, acc, total, frames, max, off }
  for (const id of Rules.ALL) H[id] = { s0: null, win: 0, acc: 0, total: 0, frames: 0, max: 0, off: null };
  const offList = []; // in the order they went
  for (const id of (Q.get('off') || '').split(',')) if (Rules.ORDER.includes(id)) { H[id].off = { by: 'remembered', ms: null, at: 0 }; offList.push(id); }
  let self = 0; let chipMs = 0; // this watch's own time · the chip's (told by game-preload.js)
  let frames = 0; let w0 = 0; let streak = 0; let playingAt = null; let ema = null; let last = null; let windows = 0;
  let ab = null; let abP = null;
  const hooks = (id) => {
    try {
      const g = id === 'look' ? window.__gameLook : id === 'stream' ? window.__gameStream : id === 'audio' ? window.__gameAudio : id === 'ready' ? window.__gameReady : id === 'perf' ? window.__gamePerf : null;
      return (g && g.budget) || null;
    } catch (e) { return null; }
  };
  const spent = (id) => { if (id === 'watch') return self; if (id === 'chip') return chipMs; const b = hooks(id); try { return b && b.spent ? b.spent() : null; } catch (e) { return null; } };
  const playing = () => { const g = window.__gameReady; return g ? g.phase === 'playing' : now() - t0 > 3000; };

  // ---------- the watch: one frame callback, a look once a second ----------
  function windowEnd(t) {
    const n = frames; frames = 0; w0 = t;
    const play = playing() && n >= 10 && document.visibilityState !== 'hidden';
    let total = 0;
    for (let i = 0; i < Rules.ALL.length; i += 1) {
      const id = Rules.ALL[i]; const h = H[id];
      const s = spent(id);
      if (s == null) { h.win = 0; continue; }
      const d = h.s0 == null ? 0 : Math.max(0, s - h.s0); h.s0 = s;
      h.win = n ? d / n : 0;
      if (play) { h.total += d; h.frames += n; if (h.win > h.max) h.max = h.win; }
      total += h.win;
    }
    if (!play) { streak = 0; return; }
    if (playingAt == null) playingAt = t;
    windows += 1; last = total; ema = ema == null ? total : ema + (total - ema) * 0.3;
    if (t - playingAt < 2000) return; // (the first moments of play: the look's guard, the first loads)
    if (total > BUDGET) { streak += 1; for (const id of Rules.ORDER) H[id].acc += H[id].win; } else { streak = 0; for (const id of Rules.ORDER) H[id].acc = 0; }
    if (streak >= SUSTAIN) {
      const costs = {}; for (const id of Rules.ORDER) { costs[id] = H[id].acc / streak; H[id].acc = 0; }
      streak = 0;
      const p = Rules.pick(costs, new Set(offList));
      if (p && hooks(p.id) && hooks(p.id).off) off(p.id, 'watch', p.ms);
    }
  }
  function tick(t) {
    const a = now();
    frames += 1;
    if (!w0) w0 = t; else if (t - w0 >= 1000) windowEnd(t);
    raf(tick);
    self += now() - a;
  }
  raf(tick);

  // ---------- switching one off ----------
  function off(id, by = 'asked', ms = null) {
    if (!Rules.ORDER.includes(id) || H[id].off) return false;
    const b = hooks(id);
    try { if (b && b.off) b.off(by); } catch (e) { /* it steps aside as far as it can */ }
    H[id].off = { by, ms: ms == null ? null : +ms.toFixed(4), at: Math.round(now() - t0) };
    offList.push(id);
    try { dispatchEvent(new Event('hearth-budget')); } catch (e) { /* game-preload.js tells Hearth (remembered per game) */ }
    return true;
  }
  const isOff = (id) => Boolean(H[id] && H[id].off);
  const decided = () => offList.filter((id) => H[id].off);
  const note = () => Rules.note(TITLE, decided());
  const line = () => Rules.fmt(ema);

  // ---------- the A/B, once, under Getting ready's card ----------
  function findCam(scene) { let c = null; try { scene.traverse((o) => { if (!c && o.isCamera) c = o; }); } catch (e) { /* none */ } return c; }
  function drawables() {
    const out = []; const seen = new Set();
    const add = (r, scene, camera) => {
      if (!r || seen.has(r) || typeof r.render !== 'function' || !scene || !scene.isObject3D) return;
      const cam = camera && camera.isCamera ? camera : findCam(scene); if (!cam) return;
      let gl = null; try { gl = r.getContext(); } catch (e) { gl = null; }
      if (!gl || gl.isContextLost() || !gl.drawingBufferWidth) return;
      seen.add(r); out.push({ r, scene, camera: cam, gl });
    };
    try { const s = window.__gameStream; if (s && s.renderers) for (const e of s.renderers()) add(e.renderer, e.scene, e.camera); } catch (e) { /* fine */ }
    try { const sc = window.__scenes; if (sc) for (const k of Object.keys(sc)) { const v = sc[k]; if (v) add(v.renderer, v.scene, v.camera); } } catch (e) { /* fine */ }
    try { const g = window.__gameReady; if (g && g.renderers && g.scenes) for (const r of g.renderers) for (const s of g.scenes) { add(r, s, r.__grCam); if (seen.has(r)) break; } } catch (e) { /* fine */ }
    return out;
  }
  async function abTest(o = {}) {
    if (abP) return abP;
    abP = (async () => {
      const T = now(); const CAP = Number(o.ms) || 3500;
      const targets = drawables();
      if (!targets.length) return (ab = { skipped: 'no three.js renderer found yet' });
      const px = new Uint8Array(4);
      const drawNow = typeof window.__gmDrawNow === 'function' ? window.__gmDrawNow : null;
      const sync = (gl) => { try { if (gl.PIXEL_PACK_BUFFER_BINDING !== undefined && gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)) gl.finish(); else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } catch (e) { /* lost */ } };
      // the graphics card's own time for the main renderer, where the browser has it
      const G0 = targets[0].gl; let tq = null;
      try { const x = G0.getExtension && G0.getExtension('EXT_disjoint_timer_query_webgl2'); if (x && G0.createQuery) tq = x; } catch (e) { tq = null; }
      let gpu = null;
      const one = () => {
        let q = null;
        if (tq) { try { if (!G0.getQuery(tq.TIME_ELAPSED_EXT, G0.CURRENT_QUERY)) { q = G0.createQuery(); G0.beginQuery(tq.TIME_ELAPSED_EXT, q); } } catch (e) { q = null; } }
        const a = now();
        for (const x of targets) { try { x.r.render(x.scene, x.camera); } catch (e) { /* the game's own error */ } }
        // (round 56, fixes56) a Lab scene's page: its merged layers' render() is only noted for the frame's composite
        // (tools/three-sandbox.html): drawn now, as the frame would (else the A/B timed nothing: on ≈ off ≈ 0.15 ms)
        if (drawNow) { try { drawNow(); } catch (e) { /* the game's own error */ } }
        if (q) { try { G0.endQuery(tq.TIME_ELAPSED_EXT); } catch (e) { q = null; } }
        for (const x of targets) sync(x.gl);
        const ms = now() - a;
        if (q) {
          try { if (G0.getQueryParameter(q, G0.QUERY_RESULT_AVAILABLE) && !G0.getParameter(tq.GPU_DISJOINT_EXT)) gpu = G0.getQueryParameter(q, G0.QUERY_RESULT) / 1e6; else gpu = null; } catch (e) { gpu = null; }
          try { G0.deleteQuery(q); } catch (e) { /* fine */ }
        } else gpu = null;
        return ms;
      };
      const on = (ids, b) => { for (const id of ids) { try { const h = hooks(id); if (h && h.pause) h.pause(!b); } catch (e) { /* fine */ } } };
      let ids = Rules.ORDER.filter((id) => !H[id].off && hooks(id) && hooks(id).pause);
      if (!ids.length) return (ab = { skipped: 'no helpers on' });
      one(); const per = Math.max(Rules.median([one(), one(), one()]), 0.05); // (the first frames after getting ready are slow ones)
      const K = Math.max(3, Math.min(16, Math.round(60 / per)));
      const yieldNow = () => new Promise((r) => later(r, 0));
      // a block: K frames (after one not counted: what piled up between blocks), helpers on or stepped aside
      async function block(b, list, cost) {
        on(list, b); one();
        const s0 = cost ? list.map((id) => spent(id) || 0) : null;
        const v = []; const g = [];
        for (let k = 0; k < K; k += 1) { v.push(one()); if (gpu != null) g.push(gpu); }
        if (cost) list.forEach((id, i) => { cost[id] = (cost[id] || 0) + ((spent(id) || 0) - s0[i]) / K; });
        on(list, true);
        await yieldNow();
        return { ms: Rules.median(v), gpu: g.length ? Rules.median(g) : null };
      }
      async function pairs(n, list, cost) {
        const out = []; const gp = [];
        for (let i = 0; i < n && (i < 2 || now() - T < CAP); i += 1) {
          const first = i % 2 === 0; // (on first, then off first: a drift cancels out)
          const A = await block(first, list, first ? cost : null); const B = await block(!first, list, first ? null : cost);
          const onB = first ? A : B; const offB = first ? B : A;
          out.push([onB.ms, offB.ms]); gp.push([onB.gpu, offB.gpu]);
        }
        return { pairs: out, gpu: gp };
      }
      const cost = {};
      let run = await pairs(4, ids, cost);
      for (const id of ids) cost[id] = +((cost[id] || 0) / Math.max(1, run.pairs.length)).toFixed(4);
      const own = (c) => Object.values(c).reduce((a, b) => a + b, 0);
      let j = Rules.judge(run.pairs, BUDGET, own(cost));
      const res = { frames: K, perMs: +per.toFixed(3), budgetMs: +BUDGET.toFixed(3), on: Rules.median(run.pairs.map((p) => p[0])), off: Rules.median(run.pairs.map((p) => p[1])), gpu: tq ? { on: Rules.median(run.gpu.map((p) => p[0])), off: Rules.median(run.gpu.map((p) => p[1])) } : null, judge: j, cost, turnedOff: [], helpers: ids.slice() };
      // slower: the most expensive (its own measured time in those frames) goes, the A/B again, until on ≈ off
      while (j.slower && ids.length && now() - T < CAP) {
        const p = Rules.pick(cost, new Set(offList.concat(Rules.ORDER.filter((id) => !ids.includes(id)))));
        if (!p || p.ms < BUDGET * 0.25) break; // (none of them costs a real share: nothing switched off on a guess)
        off(p.id, 'ab', p.ms); res.turnedOff.push(p.id);
        ids = ids.filter((id) => id !== p.id); delete cost[p.id];
        if (!ids.length) { j = { slower: false, delta: null, noise: null, pairs: 0 }; break; }
        const c2 = {}; run = await pairs(2, ids, c2);
        j = Rules.judge(run.pairs, BUDGET, own(c2) / Math.max(1, run.pairs.length));
        res.after = { on: Rules.median(run.pairs.map((q) => q[0])), off: Rules.median(run.pairs.map((q) => q[1])), judge: j };
      }
      if (res.turnedOff.length) one(); // (what switching off changed is drawn once here, under the card)
      // the Best look's picture (its shadow maps over the game's own size) on the graphics card, for the doctor
      const lk = hooks('look');
      // (round 56, fixes56) not on a Lab scene's page (drawNow): its shadow maps made again and again in real composites
      // just before play left first-5-s compiles / uploads behind (gameready's optimized play, 3 runs in 5); the picture
      // is the doctor's information only, the look's own guard decides
      if (!drawNow && !H.look.off && lk && lk.picture && lk.picture(true) && now() - T < CAP + 1000) {
        const pic = []; const pg = [];
        for (let i = 0; i < 2; i += 1) {
          lk.picture(true); one(); const a = []; const ag = []; for (let k = 0; k < K; k += 1) { a.push(one()); if (gpu != null) ag.push(gpu); }
          lk.picture(false); one(); const b = []; const bg = []; for (let k = 0; k < K; k += 1) { b.push(one()); if (gpu != null) bg.push(gpu); }
          pic.push([Rules.median(a), Rules.median(b)]); pg.push([ag.length ? Rules.median(ag) : null, bg.length ? Rules.median(bg) : null]);
          await yieldNow();
        }
        lk.picture(true); one(); // (its shadow maps made again here, under the card, not in the first frame of play)
        const on1 = Rules.median(pic.map((p) => p[0])); const off1 = Rules.median(pic.map((p) => p[1]));
        res.picture = { on: +on1.toFixed(3), off: +off1.toFixed(3), costMs: +(on1 - off1).toFixed(3), gpu: tq ? { on: Rules.median(pg.map((p) => p[0])), off: Rules.median(pg.map((p) => p[1])) } : null, refreshMs: +(1000 / HZ).toFixed(2), fits: on1 <= 1000 / HZ };
      }
      res.ms = Math.round(now() - T);
      return (ab = res);
    })().catch((e) => (ab = { skipped: `error: ${String(e && e.message || e).slice(0, 120)}` }));
    return abP;
  }

  // ---------- what Hearth reads ----------
  function pub() {
    const helpers = {};
    for (const id of Rules.ALL) {
      const h = H[id]; const has = id === 'chip' ? chipMs > 0 : id === 'watch' ? true : spent(id) != null;
      if (!has && !h.off) continue;
      helpers[id] = { name: Rules.NAMES[id], ms: +h.win.toFixed(4), avg: h.frames ? +(h.total / h.frames).toFixed(4) : null, max: +h.max.toFixed(4), on: !h.off, ...(h.off ? { off: h.off } : {}) };
    }
    return JSON.stringify({ hz: HZ, budgetMs: +BUDGET.toFixed(3), playing: playing(), windows, totalMs: last == null ? null : +last.toFixed(4), avgMs: ema == null ? null : +ema.toFixed(4), line: line(), helpers, off: decided().map((id) => ({ id, name: Rules.NAMES[id], ...H[id].off })), note: note(), ab, isolated: Boolean(window.crossOriginIsolated), title: TITLE });
  }
  Object.defineProperty(window, '__hearthBudget', { configurable: true, value: Object.freeze({
    pub, line, note, isOff, off: (id, by) => off(id, by || 'asked'), ab: abTest,
    chip: (ms) => { if (ms > 0 && ms < 1000) chipMs += ms; return { line: line(), note: note() }; },
    budget: { spent: () => self }, rules: Rules,
  }) });
}());
