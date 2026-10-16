// ▶ Play, got ready (round 52, gameready). The owner: "I have a three.js game (Clink) and I want it to run buttery smooth
// at max graphical fidelity when I take the time to load it up properly." ▶ Play (GameMode, the game window) calls
//   GameReady.prepare(source, onProgress, opts) → { ok, ms, steps, inventory, findings, plan, … }
// with source = { kind: 'lab', id, title } (a Lab scene, the main path) or { kind: 'html', path, title } (a built game's
// folder / page). Preparing, before the game's first played frame, behind a calm card ("Getting Clink ready… textures
// 40/120 · 80 %", Play now, Optimize for play, Esc):
//   1. the scan: the scene's references and the files its code names (an HTML build: what its warm run loaded, kept
//      by Hearth for the next launch); the 3D models hashed, Hearth's optimized copies looked up (a fresh copy is used
//      through a URL / path rewrite; the owner's files are only read)
//   2. everything in: pictures, models (their Draco / meshopt / KTX2 decoders loaded once by the loader), sounds
//      decoded, videos at their first frame
//   3. every texture at the graphics card's best anisotropy, with mipmaps, uploaded now (initTexture)
//   4. every shader compiled (compileAsync: parallel), then warm frames (lights, shadows, materials as they draw) and
//      anything new compiled again. Chromium keeps the compiled shaders on disk (GPUCache), so a second launch is faster
//   5. what it found ("3 textures are 8K — they cost 1.1 GB of video memory"); then the game plays at 100 % quality and
//      the first 5 s are counted (shaders compiled / textures uploaded: 0 when it worked)
// Optimize for play (one click): 3D models compressed (meshopt; textures as KTX2 when the encoder can) into Hearth's
// own cache, keyed by the file's hash; a changed file's old copy goes to the Trash; a 4 GB cap. No encoder: the install
// command is shown and runs only after a click. Model: tools/gameready-core.js; main: gamereadymain.js; HTML games:
// tools/gameready-page.js (inside the game's page). Contract with ▶ Play: tools/game-api.md.
const GameReady = (() => {
  const C = GameReadyCore;
  const G = () => window.hub?.gameReady;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (checks: localStorage 'gameready.test' = { tool: a gltfpack path, noPrep: true (the "before"), hold: ms the found card shows })
  const T = () => { try { return JSON.parse(localStorage.getItem('gameready.test') || 'null') || {}; } catch { return {}; } };
  const plat = () => (/^Win/.test(navigator.platform) ? 'win32' : /Mac/.test(navigator.platform) ? 'darwin' : 'linux');
  const MODEL = /\.(glb|gltf)$/i;
  let R = null; // the game being got ready / played
  let map = {}; // a Lab scene's model references → their optimized copies (pathFor), while it plays
  const S = { runs: 0, last: null };
  const waits = new Set();

  // ---------- messages from the game (the Lab's preview / ▶ Play's window; an HTML game's page) ----------
  function onBox(msg) {
    if (msg.type === 'ready-progress' && R?.kind === 'lab' && msg.id === R.id) {
      if (msg.stage === 'assets') R.set('assets', msg.total ? msg.done / msg.total : 1, { done: msg.done, total: msg.total });
      else if (msg.stage === 'shaders') R.set('effects', msg.total ? msg.done / msg.total : 1, { done: msg.done, total: msg.total });
    }
    for (const w of [...waits]) if (w.test(msg)) { waits.delete(w); w.resolve(msg); }
  }
  function wait(test, ms) { return new Promise((resolve) => { const w = { test, resolve }; waits.add(w); setTimeout(() => { if (waits.delete(w)) resolve(null); }, ms); }); }
  function ask(r, m, test, ms = 30000) { const p = wait(test, ms); r.port.send(m); return Promise.race([p, r.stopped]); }
  let fromOn = false;
  function listenHtml() {
    if (fromOn || !G()?.onFrom) return;
    fromOn = true;
    G().onFrom((m) => {
      if (!m) return;
      const r = R?.kind === 'html' ? R : null;
      if (m.type === 'gr-hello' && r) G().to({ type: 'gr-config', title: r.title, noPrep: Boolean(T().noPrep) });
      if (m.type === 'gr-progress' && r) r.onProgress?.({ stage: m.text, pct: m.pct, text: `${C.title(r.title)} ${m.text} · ${m.pct} %` });
      if (m.type === 'gr-first5' && r) { r.first5 = { compiles: m.compiles, links: m.links, uploads: m.uploads, reuploads: m.reuploads, frames: m.frames }; S.last = info(r); }
      if (m.type === 'gr-cancel' && r) stop();
      if (m.type === 'game-closed' && r) { r.closed = true; if (R === r) R = null; }
      onBox(m);
    });
  }

  // ---------- the card (a Lab scene: over the preview; an HTML game draws its own inside its window) ----------
  function card(r) {
    const title = el('div', { class: 'gr-title', text: C.title(r.title) });
    const line = el('div', { class: 'gr-line', text: C.line('scan', {}, 0) });
    const fill = el('i');
    const bar = el('div', { class: 'gr-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
    const found = el('ul', { class: 'gr-found' });
    const note = el('div', { class: 'gr-note', hidden: true });
    const cmd = el('div', { class: 'gr-cmd', hidden: true });
    const main = el('button', { class: 'gr-btn gr-main', type: 'button', text: 'Play now', on: { click: () => r.onMain?.() } });
    const opt = el('button', { class: 'gr-btn', type: 'button', text: 'Optimize for play', hidden: true, title: 'Compresses the 3D models into Hearth\'s own cache (your files stay as they are), then gets the game ready again', on: { click: () => r.onOpt?.() } });
    const esc = el('div', { class: 'gr-esc', text: 'Esc to leave' });
    const wrap = el('div', { class: 'gr-ready', role: 'status', 'aria-live': 'polite' }, el('div', { class: 'gr-card' }, title, line, bar, found, note, cmd, el('div', { class: 'gr-row' }, main, opt), esc));
    r.port.host?.append(wrap);
    let pct = -1; let text = '';
    const key = (e) => { if (e.key === 'Escape' && R === r && r.phase !== 'playing') { e.preventDefault(); e.stopImmediatePropagation(); stop(); } };
    document.addEventListener('keydown', key, true);
    r.onMain = () => (r.phase === 'install' ? installNow(r) : r.phase === 'found' ? play() : skip(r));
    r.onOpt = () => (r.phase === 'install' ? back(r) : optimizeNow(r));
    return {
      set(p, t) {
        p = Math.max(0, Math.min(100, Math.round(p)));
        if (p !== pct) { pct = p; fill.style.transform = `scaleX(${p / 100})`; bar.setAttribute('aria-valuenow', String(p)); }
        const tx = `${t} · ${p} %`;
        if (tx !== text) { text = tx; line.textContent = tx; }
      },
      canOptimize(n) { opt.hidden = !n; opt.textContent = 'Optimize for play'; if (n) opt.title = `Compresses ${n === 1 ? 'its 3D model' : `its ${n} 3D models`} into Hearth's own cache (your files stay as they are), then gets the game ready again`; },
      findings(list) { found.replaceChildren(...list.slice(0, 3).map((f) => el('li', { text: f.text }))); },
      install(plan) { title.textContent = 'Optimize for play'; note.hidden = false; note.textContent = `It needs ${plan.why}. Hearth runs this in a Terminal window only when you press Install:`; cmd.hidden = false; cmd.textContent = plan.command; main.textContent = 'Install'; opt.hidden = false; opt.textContent = 'Not now'; },
      installed() { note.textContent = 'Installing in its own window. When it says done, press Optimize again.'; main.textContent = 'Play now'; opt.textContent = 'Optimize for play'; cmd.hidden = true; },
      normal() { title.textContent = C.title(r.title); note.hidden = true; cmd.hidden = true; main.textContent = 'Play now'; },
      ready() { title.textContent = `${String(r.title || 'The game').slice(0, 40)} is ready`; main.textContent = 'Play'; },
      remove() { document.removeEventListener('keydown', key, true); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 260); },
    };
  }

  // ---------- the scan ----------
  // the files a scene's code names ('ship.glb', 'https://…/sky.hdr', refs.ship): reported, and waited for in the run
  const CODE_FILES = /(['"`])([^'"`\s]{1,300}\.(?:glb|gltf|fbx|obj|png|jpe?g|webp|avif|ktx2|basis|hdr|exr|mp3|wav|ogg|m4a|mp4|webm|json|bin))\1/gi;
  function codeFiles(codes) {
    const out = new Set();
    for (const c of codes) for (const m of String(c).matchAll(CODE_FILES)) out.add(m[2]);
    return [...out].slice(0, 200);
  }
  async function hashFiles(paths) {
    if (!paths.length || !G()?.hash) return [];
    return (await G().hash(paths)).filter((f) => f && !f.missing && f.hash);
  }

  // ---------- a Lab scene ----------
  async function labScan(r) {
    r.set('scan', 0.1);
    const L = r.port;
    if (r.source.id && L.scene?.()?.id !== r.source.id && L.open) { L.open(r.source.id); const t0 = Date.now(); while (L.scene?.()?.id !== r.source.id && Date.now() - t0 < 8000) await sleep(50); await sleep(400); }
    const refs = L.refs?.() || [];
    r.scan = { refs: refs.length, kinds: refs.reduce((o, x) => ({ ...o, [x.kind]: (o[x.kind] || 0) + 1 }), {}), codeFiles: codeFiles(L.code?.() || []) };
    r.models = refs.filter((x) => x.kind === 'model' && MODEL.test(x.name || x.path));
    r.files = await hashFiles(r.models.map((x) => x.path));
    await applyPlan(r);
    r.set('scan', 1);
  }
  // Hearth's optimized copies of the scene's models: fresh ones are read instead of the originals (pathFor), changed
  // references are read again with one run
  async function applyPlan(r) {
    if (!G()?.plan) return;
    r.plan = await G().plan({ files: r.files });
    const next = r.plan.map || {};
    const changed = r.models.filter((x) => (map[C.norm(x.path, plat())] || null) !== (next[C.norm(x.path, plat())] || null)).map((x) => x.id);
    map = next;
    const can = r.plan.missing.filter((f) => C.canOptimize(f, { kind: r.kind }).ok).length;
    r.ui?.canOptimize(can);
    if (changed.length && r.port.reread) { await r.port.reread(changed); await sleep(300); }
  }
  async function labPrepare(r) {
    const id = r.id;
    r.port.send({ type: 'ready-lock', on: true }); // 100 % quality from now on (no adaptive steps, no doze, no fps cap)
    await labScan(r);
    if (r.skip) return;
    // 2–3. everything in, textures at the best anisotropy (before their upload), what the scene costs
    r.set('assets', 0);
    let a = performance.now();
    r.steps.scan = await ask(r, { type: 'ready-scan', id }, (m) => m.type === 'ready-scanned' && m.id === id, 60000);
    r.ms.assets = Math.round(performance.now() - a);
    if (r.skip) return;
    const nTex = r.steps.scan?.textures?.length || 0;
    r.set('textures', 0, { done: 0, total: nTex });
    // 3–4. every shader compiled, every texture uploaded
    a = performance.now();
    r.steps.prep = await ask(r, { type: 'ready-prep', id }, (m) => m.type === 'ready-prepped' && m.id === id, 90000);
    r.ms.effects = Math.round(performance.now() - a);
    r.set('textures', 1, { done: r.steps.prep?.textures ?? nTex, total: nTex });
    if (r.skip) return;
    // 4. warm frames: what the frames themselves draw (shadow maps, post passes, a layer that shows later), compiled now
    a = performance.now();
    r.steps.warm = [];
    for (let i = 0; i < 2 && !r.skip; i += 1) {
      r.steps.warm.push(await ask(r, { type: 'ready-warm', id, n: 4 }, (m) => m.type === 'ready-warmed' && m.id === id, 15000));
      r.set('warm', (i + 1) / 2);
    }
    r.ms.warm = Math.round(performance.now() - a);
    const after = await ask(r, { type: 'ready-scan', id }, (m) => m.type === 'ready-scanned' && m.id === id, 15000); // (programs now compiled)
    r.inventory = { ...(r.steps.scan || {}), programs: after?.programs ?? r.steps.scan?.programs, calls: after?.calls ?? r.steps.scan?.calls, triangles: after?.triangles ?? r.steps.scan?.triangles };
  }

  // ---------- an HTML game ----------
  async function htmlPrepare(r) {
    listenHtml();
    r.set = (stage, f) => r.onProgress?.({ stage, pct: C.progress(stage, f), text: C.line(stage, {}, f) });
    const root = String(r.source.path || '').replace(/[\\/][^\\/]*\.html?$/i, '');
    r.root = root;
    const known = await G().scan({ root }).catch(() => null);
    r.decoders = known?.decoders || [];
    r.files = await hashFiles((known?.files || []).filter((p) => MODEL.test(p)));
    r.plan = r.files.length ? await G().plan({ files: r.files }) : { fresh: [], stale: [], missing: [], map: {} };
    const ready = wait((m) => m.type === 'gr-ready', 180000);
    const w = await G().openHtml({ path: r.source.path, title: r.title, map: r.plan.map || {} });
    if (!w?.ok) throw new Error(w?.error || 'the game window didn\'t open');
    r.win = w;
    const m = await Promise.race([ready, r.stopped]);
    if (!m) return;
    r.steps.page = m; r.ms = { ...(m.steps || {}) };
    r.inventory = m.inventory || {};
    // what the warm run loaded, kept for the next launch (its models are then known before the game asks for them)
    const files = (m.inventory?.files || []).map((f) => { try { const u = new URL(f.url); return u.protocol === 'hearth-game:' ? `${w.root}/${decodeURIComponent(u.pathname.replace(/^\/+/, ''))}` : null; } catch { return null; } }).filter(Boolean);
    r.loaded = files;
    if (files.length) await G().scan({ root: w.root, files, decoders: m.inventory?.decoders || [] }).catch(() => null);
    if (!r.files.length && files.some((p) => MODEL.test(p))) { r.files = await hashFiles(files.filter((p) => MODEL.test(p))); r.plan = await G().plan({ files: r.files }); }
    r.decoders = m.inventory?.decoders || r.decoders;
    r.phase = 'playing'; // (the page plays by itself once ready; its first 5 s arrive as gr-first5)
  }

  // ---------- prepare / play / stop ----------
  async function prepare(source, onProgress, opts = {}) {
    if (R) stop();
    const kind = source?.kind === 'html' ? 'html' : 'lab';
    const port = opts.port || (kind === 'lab' ? window.ThreeLab?.game : null);
    if (kind === 'lab' && !port) return { ok: false, error: 'Open the Three.js Lab first' };
    if (kind === 'html' && !G()?.openHtml) return { ok: false, error: 'This Hearth can\'t open game windows' };
    let stopNow = null;
    const r = R = { id: `gr${Date.now().toString(36)}${S.runs}`, kind, source, title: source.title || source.name || 'the game', port, onProgress, phase: 'ready', t0: performance.now(), steps: {}, ms: {}, skip: false };
    r.stopped = new Promise((res) => { stopNow = res; }); r.wake = () => stopNow?.(null);
    S.runs += 1;
    if (kind === 'lab') {
      if (opts.card !== false) r.ui = card(r);
      r.set = (stage, f, counts = {}) => { const p = C.progress(stage, f); r.ui?.set(p, C.label(stage, counts)); r.onProgress?.({ stage, pct: p, text: `${C.title(r.title)} ${C.line(stage, counts, f)}` }); };
    }
    try {
      if (T().noPrep) { r.noPrep = true; if (kind === 'html') await htmlPrepare(r); } // (a check's "before": no getting ready)
      else if (kind === 'lab') await labPrepare(r); else await htmlPrepare(r);
    } catch (err) { r.error = String(err?.message || err); console.warn('GameReady: getting ready', err); }
    if (R !== r) return { ok: false, cancelled: true, ...info(r) };
    r.readyMs = Math.round(performance.now() - r.t0);
    r.findings = C.findings(r.inventory || {});
    S.last = info(r);
    if (kind === 'lab') {
      r.ui?.findings(r.findings.filter((f) => f.kind !== 'shaders'));
      r.set('done', 1);
      if (opts.play !== false) {
        const hold = r.findings.some((f) => /big-textures|draw-calls|triangles|shadows/.test(f.kind)) ? (T().hold ?? 1600) : 0;
        if (hold && !r.skip) { r.phase = 'found'; r.ui?.ready(); await Promise.race([sleep(hold), r.stopped]); }
        if (R === r) await play();
      }
    }
    return { ok: !r.error, ...info(r) };
  }
  function skip(r) { if (r.phase === 'ready') { r.skip = true; r.wake(); } else if (r.phase === 'found') play(); }
  async function play() {
    const r = R; if (!r || r.phase === 'playing') return;
    r.phase = 'playing';
    r.ui?.remove(); r.ui = null;
    if (r.kind !== 'lab') return;
    // what the GPU compiles / uploads in the first 5 s of play (0 / 0 when getting ready worked)
    const count = () => { const p = wait((m) => m.type === 'ready-count', 4000); r.port.send({ type: 'ready-count', id: r.id }); return p; };
    const c0 = await count();
    r.t5 = setTimeout(async () => {
      if (R !== r) return;
      const c1 = await count();
      if (c0 && c1) r.first5 = { compiles: c1.compiles - c0.compiles, links: c1.links - c0.links, uploads: c1.uploads - c0.uploads, reuploads: c1.reuploads - c0.reuploads, lock: c1.lock, level: c1.level, shares: c1.shares };
      S.last = info(r);
    }, 5000);
  }
  // Esc / leaving the game: 100 % quality released, the originals read again where an optimized copy was in use
  function stop() {
    const r = R; if (!r) return;
    R = null; r.phase = 'stopped'; r.wake?.(); clearTimeout(r.t5);
    r.ui?.remove();
    if (r.kind === 'lab') {
      r.port.send({ type: 'ready-lock', on: false });
      const swapped = (r.models || []).filter((x) => map[C.norm(x.path, plat())]).map((x) => x.id);
      map = {};
      if (swapped.length) r.port.reread?.(swapped);
    } else if (!r.closed) G()?.closeHtml?.();
    S.last = info(r);
  }

  // ---------- Optimize for play (one click; writes only to Hearth's cache) ----------
  async function optimize(source, { onProgress } = {}) {
    const r = R && (!source || R.source === source) ? R : null;
    const files = r?.files || [];
    const kind = r?.kind || source?.kind || 'lab';
    if (!files.length) return { ok: false, error: 'No 3D models to optimize' };
    const t = await G().tool({ path: T().tool || null });
    if (!t.found) return { ok: false, needTool: true, plan: t.plan };
    const res = await G().optimize({ files, kind, ctx: { meshopt: (r?.decoders || []).includes('meshopt'), ktx2: (r?.decoders || []).includes('ktx2') }, toolPath: T().tool || null });
    onProgress?.(res);
    S.lastOptimize = { ok: res.ok, made: res.made?.length || 0, skipped: res.skipped || [], failed: res.failed || [], stale: res.stale?.length || 0, capped: res.capped?.length || 0, textures: res.textures };
    return res;
  }
  async function optimizeNow(r) {
    if (R !== r) return;
    const t = await G().tool({ path: T().tool || null });
    if (!t.found) { r.phase = 'install'; r.ui?.install(t.plan); return; }
    r.skip = true; r.wake(); // the preparation under way stops; it starts again on the optimized copies
    r.ui?.set(0, C.label('optimize'));
    const res = await optimize(r.source);
    if (!res.ok) { toast?.(calmText(res.error || 'Optimizing didn\'t work'), { type: 'error' }); }
    // again, on the optimized copies
    const src = r.source; const cb = r.onProgress; const port = r.port;
    stop();
    return prepare(src, cb, { port: port === window.ThreeLab?.game ? undefined : port });
  }
  function calmText(e) { try { return window.calmError ? window.calmError(e) : String(e); } catch { return String(e); } }
  async function installNow(r) {
    if (R !== r) return;
    const res = await G().install();
    S.install = res;
    r.phase = 'ready'; r.ui?.installed();
  }
  function back(r) { r.phase = 'ready'; r.ui?.normal(); }

  // a Lab reference read while its scene plays: the optimized copy when there's a fresh one (tools/three.js)
  const pathFor = (ref) => (R && R.kind === 'lab' && ref?.path ? map[C.norm(ref.path, plat())] || null : null);
  function info(r) {
    return { kind: r.kind, title: r.title, phase: r.phase, readyMs: r.readyMs, ms: r.ms, scan: r.scan, steps: { scan: r.steps.scan ? { ...r.steps.scan, textures: r.steps.scan.textures?.length } : undefined, prep: r.steps.prep, warm: r.steps.warm, page: r.steps.page ? { ms: r.steps.page.ms, steps: r.steps.page.steps, gl: r.steps.page.gl, uploaded: r.steps.page.uploaded, skipped: r.steps.page.skipped } : undefined }, inventory: r.inventory ? { ...r.inventory, textures: r.inventory.textures?.length, files: r.inventory.files?.length } : null, findings: r.findings, plan: r.plan ? { fresh: r.plan.fresh.length, stale: r.plan.stale.length, missing: r.plan.missing.length, swapped: Object.keys(r.plan.map || {}).length } : null, models: r.files?.length || 0, first5: r.first5, noPrep: Boolean(r.noPrep), error: r.error, loaded: r.loaded?.length };
  }

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get?.('game-ready')) {
    Commands.register({
      name: 'game-ready', area: 'Lab', args: '[optimize | stop]',
      desc: 'Get the open Lab scene ready to play: everything loaded, every shader compiled, textures at full quality (▶ Play does it by itself)',
      complete: () => [{ value: 'optimize' }, { value: 'stop' }],
      run: async (arg, ctx) => {
        const a = String(arg || '').trim();
        if (a === 'stop') { stop(); return ctx.say('Back to the Lab as it was.'); }
        if (a === 'optimize') { const res = await optimize(R?.source); return ctx.say(res.needTool ? `Optimizing needs gltfpack: \`${res.plan.command}\` (press Optimize for play on the card to install it)` : res.ok ? `Optimized ${res.made.length} model(s) into Hearth's cache` : calmText(res.error)); }
        const sc = window.ThreeLab?.game?.scene?.();
        if (!sc) return ctx.say('Open a scene in the Three.js Lab first.');
        const res = await prepare({ kind: 'lab', id: sc.id, title: sc.name });
        return ctx.say(res.ok ? `${sc.name} is ready (${Math.round((res.readyMs || 0) / 100) / 10} s).${res.findings?.length ? ` ${res.findings.filter((f) => f.kind !== 'shaders').map((f) => f.text).join('. ')}.` : ''}` : calmText(res.error || 'It couldn\'t get ready'));
      },
    });
  }

  // (what the Lab calls without loading this group: tools/three.js reads window.__gameReadyHook, never the lazy global)
  window.__gameReadyHook = { pathFor, onBox };
  return { prepare, play, stop, optimize, pathFor, onBox, state: () => S.last, current: () => (R ? info(R) : null), lastOptimize: () => S.lastOptimize || null, lastInstall: () => S.install || null, _map: () => ({ ...map }) };
})();
