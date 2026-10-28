// 📈 Test play performance (round 76, gpuplay76), the hub side (lazy group "gamemode", after gamemode.js). The owner
// (Windows, RTX 4080, 240 Hz): "play does look best but the framerate is abysmal". Nothing here could be checked on his
// real card, so this is the one-click way to measure it there and say what to change:
//   ▶ Play's right-click › 📈 Test play performance (or the F chip's 📈 button in the game, /game test, Ctrl/⌘+K)
//   → the game plays (the last one, or the Lab scene open now) → once it's playing, 20 s measured inside the game's own
//   page (gpuplay's probe below: frame gaps, the main thread's frame, the graphics card's own time through
//   EXT_disjoint_timer_query_webgl2, long frames, one frame's draw calls, the canvas, the card / ANGLE path WebGL got)
//   + Hearth's side (gpuplaymain.js: each process's processor use over the 20 s, the screens, Windows' graphics
//   settings; gpu52: the switches in effect) → GpuPlayCore.summarise: plain words, GPU vs CPU-bound, one-click fixes
//   → a card over the game (game-preload.js) and, later, in Hearth (right-click › 📈 Last performance report).
// "📋 Copy report for Claude" puts the numbers on the clipboard; nothing is sent anywhere. The probe runs only during
// the test (≈ 10–20 µs a frame: a message, two GL query calls) and takes itself out after: no steady per-frame work.
const GpuPlay = (() => {
  const C = () => GpuPlayCore;
  const KEY = 'gpuplay.last';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let run = null; // the test running: { title, t0, secs }
  let last = null; try { last = store.get(KEY, null); } catch { last = null; }
  const ev = async (code) => { const r = await window.hub.game.eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
  const gm = async () => { if (typeof GameMode === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('gamemode').catch(() => {}); return typeof GameMode !== 'undefined' ? GameMode : null; };
  const card = (d) => window.hub.game.perfCard?.(d).catch?.(() => false);
  const prefs = () => ({ quality: store.get('gamemode.quality', 'auto') === 'full' ? 'full' : 'auto', look: store.get('gamemode.look', 'best') === 'balanced' ? 'balanced' : 'best', lowLatency: store.get('gamemode.lowLatency', false) === true });

  // ---------- in the game's page (its own world: injected with game:eval, gone after) ----------
  // o.op: 'start' (o.ms) | 'read' → JSON ({ running, secs } until done, then everything) | 'stop'
  function probe(o) {
    const W = window;
    if (o.op === 'read') return W.__hearthPerfTest ? W.__hearthPerfTest.read() : 'null';
    if (o.op === 'stop') { if (W.__hearthPerfTest) W.__hearthPerfTest.stop(); return 'stopped'; }
    if (W.__hearthPerfTest && W.__hearthPerfTest.running) return 'running';
    const now = () => performance.now();
    const raf = W.requestAnimationFrame.bind(W);
    const S = { running: true, done: false, t0: now(), ms: o.ms, gaps: [], cpu: [], frames: 0, laf: [], lafN: 0, gpuWhy: '', result: null, draws: null };
    // the WebGL contexts: the ones game-preload.js saw made (__hearthGLs), and the Lab page's own (canvas.__gl)
    let gls = []; try { gls = W.__hearthGLs ? W.__hearthGLs() : []; } catch (e) { gls = []; }
    for (const cv of document.querySelectorAll('canvas')) { const g = cv.__gl; if (g && gls.indexOf(g) < 0) gls.push(g); }
    gls = gls.filter((g) => g && g.canvas && !g.isContextLost());
    const is2 = (g) => typeof WebGL2RenderingContext !== 'undefined' && g instanceof WebGL2RenderingContext;
    // the main canvas: the biggest drawing buffer on screen
    let main = null; let area = -1;
    for (const g of gls) { const a = g.drawingBufferWidth * g.drawingBufferHeight * (g.canvas.isConnected === false ? 0.01 : 1); if (a > area) { area = a; main = g; } }
    let rend = '';
    if (main) { try { const d = main.getExtension('WEBGL_debug_renderer_info'); rend = String(main.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : main.RENDERER) || ''); } catch (e) { rend = ''; } }
    const T = gls.filter(is2).map((gl) => ({ gl, ext: gl.getExtension('EXT_disjoint_timer_query_webgl2'), q: null, pend: [] })).filter((x) => x.ext);
    if (!gls.length) S.gpuWhy = 'no-context'; else if (!T.length) S.gpuWhy = 'no-timer';
    const per = new Map(); let disjoint = false; let theirs = 0;
    function collect(x) {
      const gl = x.gl;
      while (x.pend.length && gl.getQueryParameter(x.pend[0].q, gl.QUERY_RESULT_AVAILABLE)) {
        const p = x.pend.shift();
        const v = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(p.q);
        const e = per.get(p.f) || { ms: 0, k: 0 }; e.ms += v; e.k += 1; per.set(p.f, e);
      }
      if (S.frames % 30 === 0 || !S.running) { if (gl.getParameter(x.ext.GPU_DISJOINT_EXT)) disjoint = true; } // (a clock change on the card: results not to be trusted; looked at now and then)
      while (x.pend.length > 40) gl.deleteQuery(x.pend.shift().q); // (a driver that never answers: forget the oldest)
    }
    // the main thread's frame: the frame's start (rAF's time) → a message posted from it runs (rendering work done)
    const ch = new MessageChannel(); let fT = 0;
    ch.port1.onmessage = () => { if (S.running) S.cpu.push(Math.round((now() - fT) * 100) / 100); };
    let po = null;
    try {
      po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          S.lafN += 1;
          const sc = (e.scripts || []).slice().sort((a, b) => b.duration - a.duration)[0];
          const where = sc ? `${sc.sourceFunctionName || sc.invoker || ''}${sc.sourceURL ? ` (${String(sc.sourceURL).split(/[\\/]/).pop()}${sc.sourceCharPosition >= 0 ? `:${sc.sourceCharPosition}` : ''})` : ''}`.trim() : '';
          S.laf.push({ ms: Math.round(e.duration), where }); S.laf.sort((a, b) => b.ms - a.ms); if (S.laf.length > 5) S.laf.length = 5;
        }
      });
      po.observe({ type: 'long-animation-frame' });
    } catch (e) { po = null; }
    let lastT = 0; let tail = 0;
    function tick(t) {
      if (!S.running && !tail) return;
      if (S.running) {
        if (lastT) S.gaps.push(Math.round((t - lastT) * 100) / 100);
        lastT = t; S.frames += 1; fT = t; ch.port2.postMessage(0);
      }
      for (const x of T) {
        const gl = x.gl;
        if (gl.isContextLost()) { x.q = null; x.pend.length = 0; continue; }
        if (x.q) { gl.endQuery(x.ext.TIME_ELAPSED_EXT); x.pend.push({ q: x.q, f: x.f }); x.q = null; }
        if (S.running) {
          if (!gl.getQuery(x.ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) { const q = gl.createQuery(); gl.beginQuery(x.ext.TIME_ELAPSED_EXT, q); x.q = q; x.f = S.frames; } else theirs += 1; // (the game times its own: left alone)
        }
        collect(x);
      }
      if (S.running && t - S.t0 >= S.ms) { S.running = false; tail = 1; }
      if (tail) { tail += 1; if (tail > 30 || T.every((x) => !x.pend.length)) { tail = 0; countDraws(); return; } }
      raf(tick);
    }
    // one frame's draw calls, counted once at the end (the calls wrapped for that frame only, then put back)
    const DRAW = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
    function countDraws() {
      const wrapped = []; let n = 0;
      for (const gl of gls) for (const m of DRAW) { const f = gl[m]; if (typeof f !== 'function' || Object.prototype.hasOwnProperty.call(gl, m)) continue; gl[m] = function () { n += 1; return f.apply(this, arguments); }; wrapped.push([gl, m]); }
      const undo = () => { for (const [gl, m] of wrapped) { try { delete gl[m]; } catch (e) { /* fine */ } } };
      raf(() => { n = 0; raf(() => { S.draws = wrapped.length ? n : null; undo(); finish(); }); });
      setTimeout(() => { if (!S.done) { undo(); finish(); } }, 1500);
    }
    function finish() {
      if (S.done) return;
      S.done = true;
      try { if (po) po.disconnect(); } catch (e) { /* fine */ }
      ch.port1.onmessage = null;
      for (const x of T) { try { if (x.q) { x.gl.endQuery(x.ext.TIME_ELAPSED_EXT); x.gl.deleteQuery(x.q); } for (const p of x.pend) x.gl.deleteQuery(p.q); } catch (e) { /* lost */ } x.pend.length = 0; x.q = null; }
      const gpu = []; for (const e of per.values()) if (e.k === T.length) gpu.push(Math.round(e.ms * 100) / 100);
      if (T.length && !gpu.length) S.gpuWhy = theirs ? 'game-queries' : disjoint ? 'disjoint' : 'no-timer';
      else if (disjoint && gpu.length < 10) S.gpuWhy = 'disjoint';
      const attrs = main && main.getContextAttributes ? main.getContextAttributes() : null;
      const cv = main ? main.canvas : null;
      let budget = null; try { if (W.__hearthBudget) { const p = JSON.parse(W.__hearthBudget.pub()); budget = { ms: p.avgMs != null ? p.avgMs : p.totalMs, line: p.line, budgetMs: p.budgetMs, helpers: p.helpers, off: p.off }; } } catch (e) { budget = null; }
      const call = (f) => { try { return f() || ''; } catch (e) { return ''; } };
      let info = null; try { info = W.__gameInfo ? W.__gameInfo() : null; } catch (e) { info = null; }
      S.result = {
        frames: S.frames, gaps: S.gaps, cpu: S.cpu, gpu, gpuWhy: gpu.length ? (disjoint ? 'disjoint-some' : '') : S.gpuWhy, contexts: gls.length, timed: T.length, draws: S.draws,
        main: main ? { w: main.drawingBufferWidth, h: main.drawingBufferHeight, cssW: cv.clientWidth || 0, cssH: cv.clientHeight || 0, dpr: W.devicePixelRatio, attrs: attrs ? { antialias: attrs.antialias, alpha: attrs.alpha, powerPreference: attrs.powerPreference, preserveDrawingBuffer: attrs.preserveDrawingBuffer, desynchronized: attrs.desynchronized, webgl2: is2(main) } : null, renderer: rend } : null,
        laf: { n: S.lafN, worst: S.laf },
        hearth: { budget, quality: call(() => W.__gameQuality && W.__gameQuality.line()), look: call(() => W.__gameLook && W.__gameLook.text()), hitch: call(() => W.__hearthHitch && W.__hearthHitch.line()), probe: Boolean(W.__gamePerf), info },
        screen: { w: screen.width, h: screen.height, dpr: W.devicePixelRatio },
      };
    }
    S.read = () => JSON.stringify(S.done ? { done: true, ...S.result } : { running: S.running, secs: Math.round((now() - S.t0) / 100) / 10, frames: S.frames });
    S.stop = () => { S.running = false; tail = 0; finish(); };
    W.__hearthPerfTest = S;
    raf(tick);
    return 'started';
  }
  const call = (o) => `(${probe.toString()})(${JSON.stringify(o)})`;

  // the game playing (GameReady's card gone) and drawing frames
  async function waitPlaying(ms = 90000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        const ph = await ev('(() => { let ph = "playing"; try { const g = window.__gameReady; if (g) ph = JSON.parse(g.pub()).phase || ph; } catch (_) {} return ph; })()');
        if (ph === 'playing') {
          const n = await ev('new Promise((r) => { let n = 0; const f = () => { if (++n >= 8) r(n); else requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(() => r(n), 4000); })');
          if (n >= 8) return true;
        }
      } catch { /* loading */ }
      if (!(await gm())?.playing) return false;
      await sleep(300);
    }
    return false;
  }

  // ---------- the test ----------
  async function test({ secs = 20, source = null, settle = 1500 } = {}) {
    if (run) { toast('The performance test is already running in the game.', { timeout: 2500 }); return null; }
    const G = await gm();
    if (!G) { toast('▶ Play isn\'t available here.', { type: 'error' }); return null; }
    let st = G.state();
    if (st.live) { toast(`${st.source?.title || 'This game'} plays live through the Lab: test it from ▶ Play's own window (a scene without live sound / camera).`, { timeout: 6000 }); return null; }
    if (!st.playing) {
      const s = source || (await G.resolve(''));
      if (!s) { toast('No game yet: ▶ Play a Lab scene or an HTML game first.', { timeout: 4000 }); return null; }
      const info = await G.play(s);
      st = G.state();
      if (!info || !st.playing) return null;
      if (st.live) { toast(`${s.title} needs the Lab while it plays, so it can't be tested in ▶ Play's window.`, { timeout: 6000 }); return null; }
    }
    const title = st.source?.title || 'The game';
    run = { title, t0: Date.now(), secs };
    try {
      card({ state: 'wait', text: '📈 Performance test: waiting for the game to play…' });
      if (!(await waitPlaying())) throw new Error('the game didn\'t start drawing');
      await sleep(settle); // (the first frames after getting ready are the game warming up, not how it plays)
      await window.hub.gpuplay.facts({ mark: true }).catch(() => null);
      const started = await ev(call({ op: 'start', ms: secs * 1000 }));
      if (started === 'running') throw new Error('a test is already measuring this game');
      let page = null;
      for (;;) {
        await sleep(Math.min(1000, secs * 250));
        if (!G.state().playing) throw new Error('the game closed before the test finished');
        const r = JSON.parse(await ev(call({ op: 'read' })) || 'null');
        if (!r) throw new Error('the game page reloaded mid-test');
        if (r.done) { page = r; break; }
        card({ state: 'running', left: Math.max(0, Math.ceil(secs - r.secs)), text: `📈 Measuring ${title}… ${Math.max(0, Math.ceil(secs - r.secs))} s` });
        if (Date.now() - run.t0 > secs * 1000 + 60000) throw new Error('the game stopped drawing frames');
      }
      const [facts, gpu] = await Promise.all([window.hub.gpuplay.facts({}).catch(() => ({})), window.hub.gpu52?.info?.({}).catch?.(() => ({})) || {}]);
      const sample = { secs, title, kind: st.source?.kind, how: st.info?.how || '', page, gpu: gpu || {}, facts: facts || {}, prefs: prefs() };
      const sum = C().summarise(sample);
      last = { at: Date.now(), title, source: st.source, sum: { bound: sum.bound, headline: sum.headline, lines: sum.lines, tips: sum.tips, actions: sum.actions }, text: C().report(sample, sum) };
      try { store.set(KEY, last); } catch { /* the card still shows it */ }
      if (G.state().playing) await card(cardOf(last));
      else dialog();
      return last;
    } catch (err) {
      card({ state: 'off' });
      try { await ev(call({ op: 'stop' })); } catch { /* gone */ }
      toast(`Performance test stopped: ${err?.message || err}`, { timeout: 5000 });
      return null;
    } finally { run = null; }
  }
  const cardOf = (L, note = '') => ({ state: 'done', title: L.title, headline: L.sum.headline, bound: L.sum.bound, lines: L.sum.lines, tips: L.sum.tips, actions: L.sum.actions.map((a) => ({ id: a.id, label: a.label, why: a.why })), note });

  // ---------- one click each ----------
  const RESTART = new Set(['backend-d3d11', 'power-high', 'canvas-auto']);
  async function act(id, from = 'hub') {
    let text = '';
    try {
      if (id === 'copy') { await window.hub.gpuplay.copy(last?.text || ''); text = 'Report copied: paste it into a Claude chat (nothing was sent anywhere).'; }
      else if (id === 'again') { if (from === 'game') card({ state: 'off' }); test({ source: last?.source || null }); return ''; }
      else if (id === 'close') { card({ state: 'off' }); return ''; }
      else if (id === 'quality-auto') {
        store.set('gamemode.quality', 'auto');
        window.hub.game.eval('window.__gameQuality ? window.__gameQuality.set("auto") : ""').catch(() => {});
        text = 'Quality: auto is on (now, and for every game): fewer pixels only when frames drop.';
      } else if (id === 'look-balanced') { store.set('gamemode.look', 'balanced'); text = 'Graphics: Balanced from the next ▶ Play (play the game again to see it).'; }
      else if (id === 'lowlat-off') { store.set('gamemode.lowLatency', false); text = 'Low-latency canvas off from the next ▶ Play.'; }
      else if (id === 'hitch-off') { if (typeof HitchMap !== 'undefined') await HitchMap.set(false); text = 'The hitch map stopped recording.'; }
      else if (id === 'doctor') {
        if (typeof Lazy !== 'undefined') await Lazy.load('gameperf').catch(() => {});
        if (from === 'game') card({ state: 'off' });
        if (typeof GamePerf !== 'undefined') { await GamePerf.doctor(); return ''; }
        text = 'The performance doctor isn\'t in this Hearth.';
      } else if (id === 'helpers') { text = String((await Commands.get('game')?.run?.('helpers')) || ''); // (GameMode's /game helpers: what each costs, which this game plays without)
      } else if (id === 'display') { await window.hub.gpuplay.display(); text = 'Display settings opened (on your desktop, behind the game).'; }
      else if (id === 'restart') { window.hub.restartApp?.(); return ''; }
      else if (RESTART.has(id)) {
        if (typeof Lazy !== 'undefined') await Lazy.load('glrecover').catch(() => {});
        if (typeof Gpu52 === 'undefined') throw new Error('the graphics settings aren\'t in this Hearth');
        const auto = (await window.hub.gpu52?.info?.({}).catch?.(() => null))?.decision?.auto;
        const r = id === 'backend-d3d11' ? await Gpu52.set('backend', auto ? 'd3d11' : 'auto') : id === 'power-high' ? await Gpu52.set('power', 'high') : await Gpu52.set('canvas', 'auto');
        text = typeof r === 'string' ? r : r?.text || '';
      } else return '';
    } catch (err) { text = `Couldn't: ${err?.message || err}`; }
    if (from === 'game' && last) card(cardOf(last, text));
    else if (text) toast(text, { timeout: 5000, ...(RESTART.has(id) ? { action: { label: 'Restart', fn: () => window.hub.restartApp?.() } } : {}) });
    return text;
  }

  // ---------- in Hearth: the last report ----------
  function dialog() {
    if (!last) { toast('No performance test yet: right-click ▶ Play › 📈 Test play performance.', { timeout: 4000 }); return null; }
    const L = last;
    const when = new Date(L.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const btn = (label, fn, extra = {}) => el('button', { type: 'button', text: label, on: { click: fn }, ...extra });
    const note = el('p', { class: 'gp-note', text: `${L.title} · ${when} · measured on this computer; nothing is sent anywhere.` });
    const fixes = L.sum.actions.filter((a) => !['doctor', 'hitch-off'].includes(a.id)).map((a) => btn(a.label, async () => { note.textContent = await act(a.id, 'hub') || note.textContent; }, { title: a.why, dataset: { k: a.id } }));
    const copy = btn('📋 Copy report for Claude', async () => { await act('copy'); copy.textContent = '✓ Copied: paste it into Claude'; }, { class: 'primary', title: 'Puts the numbers on your clipboard (nothing is sent anywhere): paste them into a Claude chat', dataset: { k: 'copy' } });
    const dialogEl = el('dialog', { class: 'ui-modal gpuplay', attrs: { 'aria-labelledby': 'gpuplay-h' } }, el('form', { method: 'dialog', on: { submit: (e) => e.preventDefault() } },
      el('h2', { id: 'gpuplay-h', text: '📈 Play performance' }),
      el('p', { class: 'gp-head', text: L.sum.headline, dataset: { bound: L.sum.bound } }),
      el('ul', { class: 'gp-lines' }, L.sum.lines.map((l) => el('li', { text: l }))),
      ...L.sum.tips.map((t) => el('p', { class: 'gp-tip', text: t })),
      fixes.length ? el('div', { class: 'gp-fixes' }, fixes) : '',
      note,
      el('div', { class: 'dialog-actions' }, copy, btn('📈 Test again', () => { dialogEl.close(); test({ source: L.source || null }); }, { dataset: { k: 'again' } }), el('span', { class: 'spacer' }), btn('Close', () => dialogEl.close(), { dataset: { k: 'close' } }))));
    dialogEl.addEventListener('close', () => dialogEl.remove());
    document.body.append(dialogEl);
    dialogEl.showModal();
    copy.focus();
    return dialogEl;
  }

  // ▶ Play's right-click (gamemode.js menuItems)
  function menuItems() {
    const items = [{ label: '📈 Test play performance', hint: '20 s of play, in plain words', action: () => test() }];
    if (last) items.push({ label: '📈 Last performance report', hint: `${last.title}: ${{ smooth: 'smooth', gpu: 'graphics card-bound', cpu: 'processor-bound', capped: 'paced lower', software: 'no graphics card', unclear: 'unclear' }[last.sum?.bound] || ''}`, action: () => dialog() });
    return items;
  }
  // the game window's buttons (the F chip's 📈, the card's fixes) come through the main process
  window.hub.game?.onChip?.((d = {}) => {
    if (d.what === 'perftest') test();
    else if (d.what === 'perf') act(String(d.value || ''), 'game');
  });
  try { AppUI.addAction?.('📈 Test play performance', () => test()); } catch { /* no palette */ }

  return { test, act, dialog, menuItems, last: () => last, running: () => Boolean(run), _probe: probe };
})();
window.GpuPlay = GpuPlay;
