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
// (round 53, gametex) Optimize for play also compresses the textures into KTX2 (tools/gametex-core.js, gametexmain.js):
// a Lab scene's pictures and its models' pictures, each kept only when it looks the same; ▶ Play then loads the copies
// when the graphics card takes a compressed format (the originals otherwise), and the card says what it saves
// ("Textures: 640 MB → 160 MB of video memory").
const GameReady = (() => {
  const C = GameReadyCore;
  const X = () => (typeof GameTexCore !== 'undefined' ? GameTexCore : null);
  const G = () => window.hub?.gameReady;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (checks: localStorage 'gameready.test' = { tool: a gltfpack path, noPrep: true (the "before") })
  const T = () => { try { return JSON.parse(localStorage.getItem('gameready.test') || 'null') || {}; } catch { return {}; } };
  const MODEL = /\.(glb|gltf)$/i;
  const Mode = () => (typeof GameMode !== 'undefined' ? GameMode : null);
  let R = null; // the game armed / playing: { source, kind, title, files, plan, page, result, findings, first5 }
  const S = { last: null, lastOptimize: null, install: null };
  const calmText = (e) => { try { return window.calmError ? window.calmError(e) : String(e?.message || e); } catch { return String(e); } };
  // (round 53, gametex) the compressed formats this graphics card takes (KTX2Loader's reading; read once, a throwaway
  // context). checks: gameready.test.caps = 'none' → a card without any (the originals are used)
  let capsMemo = null;
  function gpuCaps() {
    if (T().caps === 'none' || !X()) return { any: false };
    if (capsMemo) return capsMemo;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ex = gl?.getSupportedExtensions?.() || [];
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      capsMemo = X().caps(ex, { platform: navigator.platform, userAgent: navigator.userAgent });
    } catch { capsMemo = { any: false }; }
    return capsMemo;
  }

  // ---------- the scan (before the window) ----------
  const rootOf = (p) => String(p || '').replace(/[\\/][^\\/]*\.html?$/i, '');
  async function modelsOf(s) {
    if (s.kind === 'lab') {
      const refs = (((await window.hub.kvGet('three-refs', {})) || {})[s.id] || []);
      // (round 53, gametex) its pictures too, each with how the scene uses it (a normal map never goes ETC1S)
      const imgs = X() ? refs.filter((x) => x.kind === 'image' && x.path && X().canEncode(x.path)) : [];
      let pics = [];
      if (imgs.length) {
        const sk = ((await window.hub.kvGet('three-sketches', [])) || []).find((x) => x.id === s.id);
        const roles = X().rolesFromCode((sk?.layers || []).map((L) => L.code || ''), imgs.map((x) => x.key));
        pics = imgs.map((x) => ({ path: x.path, role: roles[x.key] || X().roleOf(x.name || x.key), flip: true }));
      }
      return { paths: refs.filter((x) => x.kind === 'model' && MODEL.test(x.name || x.path || '')).map((x) => x.path), decoders: ['meshopt', 'ktx2', 'draco'], pics };
    }
    const known = await G().scan({ root: rootOf(s.path) }).catch(() => null);
    return { paths: (known?.files || []).filter((p) => MODEL.test(p)), decoders: known?.decoders || [] };
  }
  async function hashFiles(paths) {
    if (!paths.length) return [];
    return (await G().hash(paths)).filter((f) => f && !f.missing && f.hash);
  }
  const canOpt = (r) => (r.plan?.missing || []).filter((f) => C.canOptimize(f, { kind: r.kind, meshopt: r.decoders.includes('meshopt'), ktx2: r.decoders.includes('ktx2') }).ok).length + (r.texPlan?.missing || 0);
  // (round 53, gametex) a model whose copy may have KTX2 pictures: a Lab scene (its model loader has KTX2), an HTML build
  // whose loader showed a KTX2 decoder; only on a graphics card with compressed formats
  const variant = (r) => (r.caps?.any && (r.kind === 'lab' || r.decoders.includes('ktx2')) ? 'ktx2' : undefined);
  async function hashPics(pics) {
    if (!pics?.length) return [];
    const h = await hashFiles(pics.map((p) => p.path));
    return h.map((f) => ({ ...pics.find((p) => p.path === f.path), hash: f.hash, size: f.size }));
  }

  async function prepare(source, onProgress, opts = {}) {
    const s = source && (source.kind === 'html' ? { ...source, kind: 'html' } : { ...source, kind: 'lab' });
    if (!s || !G()?.arm) return { ok: false, error: 'This Hearth can\'t get games ready' };
    stopWatch();
    const r = R = { source: s, kind: s.kind, title: s.title || 'the game', onProgress, t0: performance.now(), files: [], pics: [], plan: null, texPlan: null, caps: null, decoders: [], page: null, result: null, findings: null, first5: null, handled: 0 };
    onProgress?.({ done: 0.1, stage: 'scan' });
    try {
      const m = await modelsOf(s);
      r.decoders = m.decoders; r.caps = gpuCaps();
      r.files = (await hashFiles(m.paths)).map((f) => ({ ...f, variant: variant(r) }));
      r.plan = r.files.length ? await G().plan({ files: r.files }) : { fresh: [], stale: [], missing: [], map: {} };
      r.pics = await hashPics(m.pics);
      if ((r.pics.length || r.files.length) && G().texplan) r.texPlan = await G().texplan({ files: r.files, pics: r.pics, caps: r.caps });
    } catch (err) { r.error = calmText(err); }
    const tx = r.texPlan?.report && r.caps?.any && (Object.keys(r.texPlan.map || {}).length || r.texPlan.models) ? r.texPlan.report.text : '';
    await G().arm({ kind: r.kind, title: r.title, map: r.plan?.map || {}, tex: r.caps?.any ? r.texPlan?.map || {} : {}, tx, noPrep: Boolean(T().noPrep || opts.noPrep), opt: canOpt(r) });
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
      const files = [...new Set(served.map((x) => WinMac.join(root, x.rel)))]; // the folder's own slash (C:\Games\Clink\models\a.glb on Windows)
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
    const text = res.ok ? doneText(res) : calmText(res.error || 'Optimizing didn\'t work');
    // (round 53) textures done without gltfpack: the meshes still could be lighter with it (shown, run only on Install)
    if (res.ok && res.meshPlan && (r.files || []).length) { say({ kind: 'install', command: res.meshPlan.command, why: res.meshPlan.why, text }); return; }
    say({ kind: 'done', text });
  }
  // what Optimize for play did, in plain words: "Optimized 1 model and 2 pictures into Hearth's cache… Textures: 49 MB →
  // 12 MB of video memory. 1 picture kept as it is: compressed it looked different."
  function doneText(res) {
    const nm = res.made?.length || 0; const np = res.pictures?.made?.length || 0; const have = (res.fresh?.length || 0) + (res.tex ? 1 : 0);
    const what = [nm ? (nm === 1 ? '1 model' : `${nm} models`) : '', np ? (np === 1 ? '1 picture' : `${np} pictures`) : ''].filter(Boolean).join(' and ');
    const head = what ? `Optimized ${what} into Hearth's cache: the next ▶ Play loads the lighter copies.` : have ? 'Already optimized: the next ▶ Play loads the lighter copies.' : 'Nothing to optimize: the models are as small as they get.';
    const kept = [...(res.pictures?.kept || []), ...(res.made || []).flatMap((m) => (m.tex?.items || []).filter((x) => x.kept))];
    const keptLine = kept.length ? ` ${kept.length === 1 ? '1 picture' : `${kept.length} pictures`} kept as ${kept.length === 1 ? 'it is' : 'they are'}: ${kept[0].why}.` : '';
    return `${head}${res.tex?.text ? ` ${res.tex.text}.` : ''}${keptLine}`;
  }

  // ---------- Optimize for play (writes only to Hearth's cache) ----------
  async function optimize(source) {
    const s = source || R?.source || Mode()?.last?.();
    if (!s) return { ok: false, error: 'No game to optimize: ▶ Play one first' };
    let r = R && R.source && (R.source.id || R.source.path) === (s.id || s.path) ? R : null;
    if (!r) { const m = await modelsOf(s); r = { kind: s.kind, decoders: m.decoders, caps: gpuCaps() }; r.files = (await hashFiles(m.paths)).map((f) => ({ ...f, variant: variant(r) })); r.pics = await hashPics(m.pics); }
    if (!r.files.length && !r.pics?.length) return { ok: false, error: 'No 3D models or pictures to optimize in this game' };
    const res = await G().optimize({ files: r.files, pics: r.pics || [], caps: r.caps || gpuCaps(), kind: r.kind, ctx: { meshopt: r.decoders.includes('meshopt'), ktx2: r.decoders.includes('ktx2') }, toolPath: T().tool || null });
    S.lastOptimize = { ok: res.ok, made: res.made || [], skipped: res.skipped || [], failed: res.failed || [], stale: res.stale?.length || 0, capped: res.capped?.length || 0, textures: res.textures, fresh: res.fresh?.length || 0, pictures: res.pictures || null, tex: res.tex || null, meshTool: res.meshTool };
    return res;
  }

  function stop() { stopWatch(); if (Mode()?.playing) Mode().leave(); G()?.arm(null).catch(() => {}); }
  function info(r) {
    return { kind: r.kind, title: r.title, phase: r.page?.phase || (r.started ? 'opening' : 'armed'), readyMs: r.readyMs, page: r.page ? { pct: r.page.pct, text: r.page.text, cardAt: r.page.cardAt, firstFrameAt: r.page.firstFrameAt, card: r.page.card, errors: r.page.errors } : null, result: r.result, findings: r.findings, first5: r.first5, plan: r.plan ? { fresh: r.plan.fresh.length, stale: r.plan.stale.length, missing: r.plan.missing.length, swapped: Object.keys(r.plan.map || {}).length } : null, models: r.files.length, decoders: r.decoders, loaded: r.loaded, error: r.error, tex: r.texPlan ? { swapped: Object.keys(r.texPlan.map || {}).length, fresh: r.texPlan.fresh, missing: r.texPlan.missing, kept: r.texPlan.kept, models: r.texPlan.models, report: r.texPlan.report, any: Boolean(r.caps?.any) } : null };
  }

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get?.('game-ready')) {
    Commands.register({
      name: 'game-ready', area: 'Lab', args: '[optimize]',
      desc: 'What ▶ Play found getting the last game ready (what its textures cost); "optimize" compresses its 3D models into Hearth\'s cache',
      complete: () => [{ value: 'optimize' }],
      run: async (arg, ctx) => {
        const a = String(arg || '').trim();
        if (a === 'optimize') { const res = await optimize(); return ctx.say(res.needTool ? `Optimizing needs gltfpack: \`${res.plan.command}\` (▶ Play's card has an Install button)` : res.ok ? `${doneText(res)}${res.meshPlan ? ` Lighter meshes need gltfpack: \`${res.meshPlan.command}\` (▶ Play's card has an Install button).` : ''}` : calmText(res.error)); }
        const st = S.last;
        if (!st?.result) return ctx.say('▶ Play a game first: it gets ready inside its window and says what it found.');
        return ctx.say(`${st.title}: ready in ${Math.round((st.result.ms || 0) / 100) / 10} s.${st.findings?.length ? ` ${st.findings.map((f) => f.text).join('. ')}.` : ''}${st.tex?.report && st.tex.any && (st.tex.swapped || st.tex.models) ? ` ${st.tex.report.text} (compressed copies).` : ''}${st.first5 ? ` First 5 s of play: ${st.first5.compiles} shaders compiled, ${st.first5.uploads} textures uploaded.` : ''}`);
      },
    });
  }

  return { prepare, optimize, stop, state: () => S.last, current: () => (R ? info(R) : null), lastOptimize: () => S.lastOptimize, lastInstall: () => S.install };
})();
