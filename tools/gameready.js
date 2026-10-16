// ▶ Play, got ready (round 52, gameready). The owner: "I have a three.js game (Clink) and I want it to run buttery smooth
// at max graphical fidelity when I take the time to load it up properly." ▶ Play (GameMode.play, gamemode.js) calls
//   GameReady.prepare(source, onProgress) before it opens the game window (tools/game-api.md)
// with source = { kind: 'lab', id, title } (a Lab scene, the main path) or { kind: 'html', path, title } (a built game).
// Here, in the hub, before the window: the scan (the scene's references / what the build loaded last time, kept by Hearth),
// the 3D models hashed and Hearth's optimized copies looked up, and the window ARMED (gamereadymain.js): its pages get
// tools/gameready-page.js first, and the optimized copies are served for their originals' addresses / copied into the
// scene's page. The preparation itself then runs INSIDE ▶ Play's window, behind the calm card shown before the first
// frame ("Getting Clink ready… textures 40/120 · 80 %", Play now, Optimize for play, Esc): everything loaded, every
// texture at the best anisotropy uploaded, every shader compiled and warmed; then the first 5 s of play are counted.
// This side follows it through game:eval (window.__gameReady.pub()), answers the card's Optimize / Install, works out
// what it found ("1 texture is 4K — it costs 43 MB of video memory") and keeps an HTML build's files for the next launch.
// Optimize for play: 3D models compressed into Hearth's own cache only (gltfpack: meshopt, exact geometry, names kept;
// KTX2 textures when the encoder can), keyed by file hash, stale copies to the Trash, a 4 GB cap; no encoder → the
// install command shown, run only after a click. Model: tools/gameready-core.js; main: gamereadymain.js.
const GameReady = (() => {
  const C = GameReadyCore;
  const G = () => window.hub?.gameReady;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (checks: localStorage 'gameready.test' = { tool: a gltfpack path, noPrep: true (the "before") })
  const T = () => { try { return JSON.parse(localStorage.getItem('gameready.test') || 'null') || {}; } catch { return {}; } };
  const MODEL = /\.(glb|gltf)$/i;
  const Mode = () => (typeof GameMode !== 'undefined' ? GameMode : null);
  let R = null; // the game armed / playing: { source, kind, title, files, plan, page, result, findings, first5 }
  const S = { last: null, lastOptimize: null, install: null };
  const calmText = (e) => { try { return window.calmError ? window.calmError(e) : String(e?.message || e); } catch { return String(e); } };

  // ---------- the scan (before the window) ----------
  const rootOf = (p) => String(p || '').replace(/[\\/][^\\/]*\.html?$/i, '');
  async function modelsOf(s) {
    if (s.kind === 'lab') {
      const refs = (((await window.hub.kvGet('three-refs', {})) || {})[s.id] || []);
      return { paths: refs.filter((x) => x.kind === 'model' && MODEL.test(x.name || x.path || '')).map((x) => x.path), decoders: ['meshopt', 'ktx2', 'draco'] };
    }
    const known = await G().scan({ root: rootOf(s.path) }).catch(() => null);
    return { paths: (known?.files || []).filter((p) => MODEL.test(p)), decoders: known?.decoders || [] };
  }
  async function hashFiles(paths) {
    if (!paths.length) return [];
    return (await G().hash(paths)).filter((f) => f && !f.missing && f.hash);
  }
  const canOpt = (r) => (r.plan?.missing || []).filter((f) => C.canOptimize(f, { kind: r.kind, meshopt: r.decoders.includes('meshopt'), ktx2: r.decoders.includes('ktx2') }).ok).length;

  async function prepare(source, onProgress, opts = {}) {
    const s = source && (source.kind === 'html' ? { ...source, kind: 'html' } : { ...source, kind: 'lab' });
    if (!s || !G()?.arm) return { ok: false, error: 'This Hearth can\'t get games ready' };
    stopWatch();
    const r = R = { source: s, kind: s.kind, title: s.title || 'the game', onProgress, t0: performance.now(), files: [], plan: null, decoders: [], page: null, result: null, findings: null, first5: null, handled: 0 };
    onProgress?.({ done: 0.1, stage: 'scan' });
    try {
      const m = await modelsOf(s);
      r.decoders = m.decoders;
      r.files = await hashFiles(m.paths);
      r.plan = r.files.length ? await G().plan({ files: r.files }) : { fresh: [], stale: [], missing: [], map: {} };
    } catch (err) { r.error = calmText(err); }
    await G().arm({ kind: r.kind, title: r.title, map: r.plan?.map || {}, noPrep: Boolean(T().noPrep || opts.noPrep), opt: canOpt(r) });
    watchMode();
    onProgress?.({ done: 1, stage: 'scan' });
    S.last = info(r);
    return { ok: !r.error, ...info(r) };
  }

  // ---------- following the window (GameMode's start / end; the page through game:eval) ----------
  let modeOff = null; let timer = 0;
  function watchMode() {
    if (modeOff || !Mode()?.on) return;
    modeOff = Mode().on((e) => {
      if (!R) return;
      if (e.type === 'start') { R.started = true; poll(R); }
      if (e.type === 'end') { stopWatch(); G()?.arm(null).catch(() => {}); }
    });
  }
  function stopWatch() { clearTimeout(timer); timer = 0; }
  async function poll(r) {
    clearTimeout(timer);
    if (R !== r) return;
    let v = null;
    try { const x = await window.hub.game.eval('window.__gameReady ? window.__gameReady.pub() : null'); v = x?.value ? JSON.parse(x.value) : null; } catch { v = null; }
    if (R !== r) return;
    if (v) {
      r.page = v;
      if (v.phase === 'ready' && v.text) r.onProgress?.({ done: v.pct / 100, stage: 'prepare', text: v.text });
      if ((v.want === 'optimize' || v.want === 'install') && v.wantN > r.handled) { r.handled = v.wantN; cardAsk(r, v.want); }
      if (v.result && !r.result) { r.result = v.result; r.findings = C.findings(v.result.inventory || {}); r.readyMs = Math.round(performance.now() - r.t0); if (r.kind === 'html') keepScan(r); }
      if (v.first5 && !r.first5) { r.first5 = v.first5; S.last = info(r); return; } // (done: nothing more to follow)
      S.last = info(r);
    }
    timer = setTimeout(() => poll(r), v?.phase === 'playing' ? 500 : 200);
  }
  // an HTML build: what the window served (every file the game asked for) is kept, so the next launch knows its models
  async function keepScan(r) {
    try {
      const served = await G().served();
      const root = rootOf(r.source.path);
      const files = [...new Set(served.map((x) => `${root}/${x.rel}`))];
      const dec = [...new Set(served.map((x) => (/meshopt_decoder/i.test(x.rel) ? 'meshopt' : /basis_transcoder/i.test(x.rel) ? 'ktx2' : /draco_(wasm_)?decoder/i.test(x.rel) ? 'draco' : null)).filter(Boolean))];
      r.loaded = files.length; r.decoders = dec; r.served = served;
      if (files.length) await G().scan({ root, files, decoders: dec });
      if (!r.files.length && files.some((p) => MODEL.test(p))) { r.files = await hashFiles(files.filter((p) => MODEL.test(p))); r.plan = await G().plan({ files: r.files }); }
      S.last = info(r);
    } catch { /* only a cache */ }
  }
  // the card's Optimize for play / Install, answered in the window
  async function cardAsk(r, want) {
    const say = (a) => window.hub.game.eval(`window.__gameReady && window.__gameReady.answer(${JSON.stringify(a)})`).catch(() => {});
    if (want === 'install') { const res = await G().install(); S.install = res; say({ kind: 'done', text: `Installing in its own window (${res.command}). When it says done, press ▶ Play again.` }); return; }
    const res = await optimize(r.source);
    if (res.needTool) { say({ kind: 'install', command: res.plan.command, why: res.plan.why }); return; }
    const n = res.made?.length || 0; const have = (res.fresh?.length || 0);
    say({ kind: 'done', text: res.ok ? (n ? `Optimized ${n === 1 ? '1 model' : `${n} models`} into Hearth's cache: the next ▶ Play loads the lighter ${n === 1 ? 'copy' : 'copies'}.` : have ? 'Already optimized: the next ▶ Play loads the lighter copies.' : 'Nothing to optimize: the models are as small as they get.') : calmText(res.error || 'Optimizing didn\'t work') });
  }

  // ---------- Optimize for play (writes only to Hearth's cache) ----------
  async function optimize(source) {
    const s = source || R?.source || Mode()?.last?.();
    if (!s) return { ok: false, error: 'No game to optimize: ▶ Play one first' };
    let r = R && R.source && (R.source.id || R.source.path) === (s.id || s.path) ? R : null;
    if (!r) { const m = await modelsOf(s); r = { kind: s.kind, files: await hashFiles(m.paths), decoders: m.decoders }; }
    if (!r.files.length) return { ok: false, error: 'No 3D models to optimize in this game' };
    const t = await G().tool({ path: T().tool || null });
    if (!t.found) return { ok: false, needTool: true, plan: t.plan };
    const res = await G().optimize({ files: r.files, kind: r.kind, ctx: { meshopt: r.decoders.includes('meshopt'), ktx2: r.decoders.includes('ktx2') }, toolPath: T().tool || null });
    S.lastOptimize = { ok: res.ok, made: res.made || [], skipped: res.skipped || [], failed: res.failed || [], stale: res.stale?.length || 0, capped: res.capped?.length || 0, textures: res.textures, fresh: res.fresh?.length || 0 };
    return res;
  }

  function stop() { stopWatch(); if (Mode()?.playing) Mode().leave(); G()?.arm(null).catch(() => {}); }
  function info(r) {
    return { kind: r.kind, title: r.title, phase: r.page?.phase || (r.started ? 'opening' : 'armed'), readyMs: r.readyMs, page: r.page ? { pct: r.page.pct, text: r.page.text, cardAt: r.page.cardAt, firstFrameAt: r.page.firstFrameAt, card: r.page.card, errors: r.page.errors } : null, result: r.result, findings: r.findings, first5: r.first5, plan: r.plan ? { fresh: r.plan.fresh.length, stale: r.plan.stale.length, missing: r.plan.missing.length, swapped: Object.keys(r.plan.map || {}).length } : null, models: r.files.length, decoders: r.decoders, loaded: r.loaded, error: r.error };
  }

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get?.('game-ready')) {
    Commands.register({
      name: 'game-ready', area: 'Lab', args: '[optimize]',
      desc: 'What ▶ Play found getting the last game ready (what its textures cost); "optimize" compresses its 3D models into Hearth\'s cache',
      complete: () => [{ value: 'optimize' }],
      run: async (arg, ctx) => {
        const a = String(arg || '').trim();
        if (a === 'optimize') { const res = await optimize(); return ctx.say(res.needTool ? `Optimizing needs gltfpack: \`${res.plan.command}\` (▶ Play's card has an Install button)` : res.ok ? `Optimized ${res.made.length} model(s) into Hearth's cache: the next ▶ Play loads them` : calmText(res.error)); }
        const st = S.last;
        if (!st?.result) return ctx.say('▶ Play a game first: it gets ready inside its window and says what it found.');
        return ctx.say(`${st.title}: ready in ${Math.round((st.result.ms || 0) / 100) / 10} s.${st.findings?.length ? ` ${st.findings.map((f) => f.text).join('. ')}.` : ''}${st.first5 ? ` First 5 s of play: ${st.first5.compiles} shaders compiled, ${st.first5.uploads} textures uploaded.` : ''}`);
      },
    });
  }

  return { prepare, optimize, stop, state: () => S.last, current: () => (R ? info(R) : null), lastOptimize: () => S.lastOptimize, lastInstall: () => S.install };
})();
