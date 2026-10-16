// ▶ Game performance (round 52, gameperf): the pure part, no DOM (dev/gameperf-test.js runs it in Node).
//   attribute(frame, budget)   why one frame over budget was late: gc · shader · texture · js · render · layout · gpu
//   summarize(raw)             the probe's session numbers (tools/gameperf-probe.js) → one report
//   scanSource(code)           per-frame allocations in a game's own code (new Vector3 in update(), clone() in the loop…)
//   doctor(report, scans)      plain-words findings with concrete fixes, sorted by impact (ms lost per second of play)
//   fidelity(report)           max-fidelity suggestions (pixel ratio, MSAA, shadows, tone mapping, anisotropy)
//   patch(code, kind, arg)     a Lab layer's code with one safe fix applied (null when it can't be done safely)
//   compact(report, findings)  the few lines a director reads (`three_do perf`), ≈ 100–250 tokens
// attribute() is also sent to the game page as text (the chip names the last stutter), so it uses nothing outside itself.
const GamePerfCore = (() => {
  // ---------- why was this frame late ----------
  // f: { dt, work (ms of the game's frame callbacks), render (ms inside renderer.render), shaderMs, texMs, layoutMs,
  //      longMs / longFn (a long animation frame's main script), gc (the JS heap dropped in this frame) }
  function attribute(f, budget) {
    const over = Math.max(0, (f.dt || 0) - budget);
    const sh = f.shaderMs || 0; const tx = f.texMs || 0; const lay = f.layoutMs || 0;
    const work = Math.max(f.work || 0, f.longMs || 0);
    const render = Math.max(0, (f.render || 0) - sh - tx);
    const js = Math.max(0, work - Math.max(f.render || 0, sh + tx));
    const known = [['shader', sh], ['texture', tx], ['layout', lay]].sort((a, b) => b[1] - a[1]);
    const share = Math.max(1, over * 0.4);
    const r1 = (x) => Math.round(x * 10) / 10;
    if (known[0][1] >= share) return { cause: known[0][0], ms: r1(over), part: r1(known[0][1]), ...(known[1][1] >= share ? { also: known[1][0] } : {}) };
    // the GPU process compiles / uploads after the call returns: a frame that linked a program or sent megabytes and
    // came late is theirs, though the calls themselves were quick
    if (f.links && (f.texMB || 0) < 16) return { cause: 'shader', ms: r1(over), part: r1(sh) };
    if ((f.texMB || 0) >= 4) return { cause: 'texture', ms: r1(over), part: r1(tx) };
    if (f.gc) return { cause: 'gc', ms: r1(over), part: r1(Math.max(0, over - known[0][1])) };
    if (js >= share || js >= budget) return { cause: 'js', ms: r1(over), part: r1(js), fn: f.longFn || f.fn || null };
    if (render >= share) return { cause: 'render', ms: r1(over), part: r1(render) };
    if (work + lay < budget * 0.9) return { cause: 'gpu', ms: r1(over), part: r1(over) };
    return { cause: 'busy', ms: r1(over), part: r1(work) };
  }
  const CAUSE = {
    gc: 'garbage collection', shader: 'a shader compile', texture: 'a texture upload', js: 'a long JS task',
    render: 'the CPU side of drawing (draw calls)', layout: 'page layout / paint', gpu: 'the graphics card (frame ready on time, shown late)', busy: 'a busy frame (several small things)',
  };

  // ---------- the session in one report ----------
  const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const median = (arr) => pct(arr, 0.5);
  const HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240, 280, 360, 480];
  // the display's rate from the frame intervals: the fast end of them, snapped to a usual rate
  function guessHz(dts) {
    const d = dts.filter((x) => x > 1.5 && x < 100);
    if (d.length < 10) return 60;
    const fast = pct(d, 0.1);
    const hz = 1000 / fast;
    return HZ.reduce((b, x) => (Math.abs(x - hz) < Math.abs(b - hz) ? x : b), 60);
  }
  function summarize(raw = {}) {
    const dts = (raw.dts || []).filter((x) => x > 0);
    const hz = raw.hz || guessHz(dts);
    const budget = 1000 / hz;
    const dtMed = median(dts) || budget;
    const frames = raw.frames || dts.length;
    const secs = Math.max(0.001, (raw.dur || dts.reduce((a, b) => a + b, 0)) / 1000);
    // a stutter: over the display's budget by half a frame and clearly slower than the game's usual frame
    const limit = Math.max(budget * 1.5, dtMed * 1.6);
    const slow = (raw.slow || []).filter((f) => f.dt > limit).map((f) => ({ ...f, ...attribute(f, Math.max(budget, Math.min(dtMed, budget * 4))) }));
    const by = {};
    for (const f of slow) { const b = (by[f.cause] ||= { n: 0, ms: 0, worst: 0 }); b.n += 1; b.ms += f.ms; b.worst = Math.max(b.worst, f.ms); }
    for (const b of Object.values(by)) { b.ms = Math.round(b.ms); b.worst = Math.round(b.worst); }
    const works = (raw.works || []).filter((x) => x >= 0);
    const gpuShare = slow.length && frames ? (by.gpu?.n || 0) / frames : 0;
    const steadyGpu = dtMed > budget * 1.3 && median(works) < budget * 0.8; // slow every frame with an idle main thread
    const alloc = raw.alloc || {};
    return {
      hz, budget: Math.round(budget * 100) / 100, frames, secs: Math.round(secs * 10) / 10,
      fps: Math.round(frames / secs), dtMed: r2(dtMed), p95: r2(pct(dts, 0.95)), p99: r2(pct(dts, 0.99)), workMed: r2(median(works)), renderMed: r2(median(raw.renders || [])),
      onTime: dts.length ? Math.round((dts.filter((x) => x <= budget * 1.2).length / dts.length) * 100) : 0,
      stutters: { n: slow.length, by, list: slow.sort((a, b) => b.ms - a.ms).slice(0, 12).map((f) => ({ t: Math.round(f.t), ms: f.ms, cause: f.cause, ...(f.fn ? { fn: f.fn } : {}), ...(f.detail ? { detail: f.detail } : {}) })) },
      gpuBound: steadyGpu || gpuShare > 0.15,
      alloc: { mbps: r2((alloc.bytes || 0) / 1048576 / secs), gcs: alloc.gcs || 0, gcPerSec: r2((alloc.gcs || 0) / secs) },
      shaders: raw.shaders || { n: 0, ms: 0, late: [] },
      textures: raw.textures || { n: 0, ms: 0, mb: 0, late: [] },
      long: raw.long || [], layout: raw.layout || { ms: 0, mutations: 0 },
      scene: raw.scene || null, self: raw.self || null, src: raw.src || null,
    };
  }
  function r2(x) { return Math.round((x || 0) * 100) / 100; }

  // ---------- per-frame allocations in the game's own code ----------
  const ALLOC = /\bnew\s+(?:THREE\.)?(Vector2|Vector3|Vector4|Quaternion|Matrix3|Matrix4|Euler|Color|Box3|Sphere|Ray|Raycaster|Plane|Frustum|Spherical)\s*\(/g;
  const HEAVY = /\bnew\s+(?:THREE\.)?(\w+(?:Geometry|Material)|Mesh|Texture|CanvasTexture|WebGLRenderTarget)\s*\(/g;
  const CLONE = /\.clone\(\s*\)/g;
  const LOOPY = /^(update|animate|tick|loop|step|render|frame|onframe|gameloop|mainloop|draw)/i;
  // the body of the block opening at code[i] === '{' (strings, comments and template literals skipped roughly)
  function blockEnd(code, i) {
    let depth = 0; let q = null;
    for (let k = i; k < code.length; k += 1) {
      const c = code[k];
      if (q) { if (c === '\\') { k += 1; continue; } if (c === q) q = null; continue; }
      if (c === '/' && code[k + 1] === '/') { const n = code.indexOf('\n', k); if (n < 0) return code.length; k = n; continue; }
      if (c === '/' && code[k + 1] === '*') { const n = code.indexOf('*/', k + 2); if (n < 0) return code.length; k = n + 1; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth += 1;
      else if (c === '}') { depth -= 1; if (depth === 0) return k; }
    }
    return code.length;
  }
  const lineAt = (code, i) => code.slice(0, i).split('\n').length;
  // every function in the code: { name, start (its '{'), end, line, decl (where its declaration starts) }
  function functions(code) {
    const out = [];
    const re = /(?:function\s+(\w+)\s*\([^)]*\)\s*\{)|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\s*\w*\s*\([^)]*\)|\(?[\w\s,{}=]*\)?\s*=>)\s*\{)|(?:^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/gm;
    let m;
    while ((m = re.exec(code))) {
      const name = m[1] || m[2] || m[3];
      if (!name || /^(if|for|while|switch|catch|with|function|return)$/.test(name)) continue;
      const start = m.index + m[0].length - 1;
      out.push({ name, start, end: blockEnd(code, start), line: lineAt(code, m.index), decl: m.index + (m[0].length - m[0].trimStart().length) });
    }
    return out;
  }
  // the per-frame code: functions handed to requestAnimationFrame / setAnimationLoop, an inline loop function, any
  // function with a loop-like name, then what those call (two levels)
  function frameBodies(code) {
    const fns = functions(code);
    const byName = new Map(fns.map((f) => [f.name, f]));
    const bodies = [];
    const seen = new Set();
    const add = (f, depth) => {
      if (!f || seen.has(f.start)) return;
      seen.add(f.start); bodies.push(f);
      if (depth >= 2) return;
      const inner = code.slice(f.start, f.end);
      const calls = new Set(); let c; const cre = /(?:^|[^.\w])(\w+)\s*\(/g;
      while ((c = cre.exec(inner))) calls.add(c[1]);
      for (const n of calls) if (byName.has(n) && n !== f.name) add(byName.get(n), depth + 1);
    };
    let m; const hand = /(?:requestAnimationFrame|setAnimationLoop)\(\s*(\w+)\s*\)/g;
    while ((m = hand.exec(code))) add(byName.get(m[1]), 0);
    const inline = /(?:requestAnimationFrame|setAnimationLoop)\(\s*(?:async\s*)?(?:function\s*\w*\s*\([^)]*\)|\(?[\w\s,]*\)?\s*=>)\s*\{/g;
    while ((m = inline.exec(code))) {
      const start = m.index + m[0].length - 1;
      add({ name: 'the frame loop', start, end: blockEnd(code, start), line: lineAt(code, m.index), decl: code.lastIndexOf('\n', m.index) + 1, inline: true }, 0);
    }
    for (const f of fns) if (LOOPY.test(f.name)) add(f, 1);
    return bodies;
  }
  // whether code[at] sits in a block opened by an if / else inside the function body starting at code[from]
  function underIf(code, from, at) {
    const open = [];
    for (let k = from + 1; k < at; k += 1) { const c = code[k]; if (c === '{') open.push(k); else if (c === '}') open.pop(); }
    return open.some((k) => /(?:\bif\s*\([^{};]*\)|\belse)\s*$/.test(code.slice(Math.max(from, k - 200), k)));
  }
  // [{ fn, line, what, kind: 'math'|'heavy'|'clone', text, hoist? }]: hoist = the line can safely make its object once
  function scanSource(code, { layer = null, max = 12 } = {}) {
    const src = String(code || '');
    const hits = [];
    for (const f of frameBodies(src)) {
      const body = src.slice(f.start, f.end);
      for (const [re, kind] of [[ALLOC, 'math'], [HEAVY, 'heavy'], [CLONE, 'clone']]) {
        re.lastIndex = 0; let m;
        while ((m = re.exec(body))) {
          const at = f.start + m.index;
          // nested functions that aren't per frame (an event handler inside the loop is still per frame: kept)
          const line = lineAt(src, at);
          if (hits.some((h) => h.line === line && h.what === (m[1] || 'clone()'))) continue;
          if (kind === 'heavy' && underIf(src, f.start, at)) continue; // (behind an if: made once, when something happens)
          const text = src.split('\n')[line - 1].trim().slice(0, 120);
          const h = { fn: f.name, line, what: kind === 'clone' ? 'clone()' : m[1], kind, text, ...(layer ? { layer } : {}) };
          if (kind === 'math') { const hz = hoistable(src, f, line); if (hz) h.hoist = true; }
          hits.push(h);
        }
      }
    }
    return hits.sort((a, b) => (b.kind === 'heavy') - (a.kind === 'heavy') || a.line - b.line).slice(0, max);
  }
  // `const v = new THREE.Vector3(a, b, c);` alone on its line, v only used as `v.` or as an argument of a method call
  const DECL = /^(\s*)(const|let)\s+(\w+)\s*=\s*new\s+((?:THREE\.)?)(Vector2|Vector3|Vector4|Quaternion|Matrix4|Euler|Color)\s*\((.*)\)\s*;?\s*$/;
  // (the arguments may hold calls — Math.sin(t) — but must close only at the end: no chained call after them)
  const balanced = (a) => { let k = 0; for (const c of a) { if (c === '(') k += 1; else if (c === ')') { k -= 1; if (k < 0) return false; } } return k === 0; };
  function hoistable(src, f, line) {
    const lines = src.split('\n');
    const m = DECL.exec(lines[line - 1]);
    if (!m || !balanced(m[6])) return null;
    const name = m[3];
    if (m[5] === 'Color' && /,/.test(m[6])) return null; // (Color.set takes one value; (r, g, b) is setRGB)
    const after = src.slice(src.indexOf('\n', lineStartIndex(src, line)) + 1, f.end);
    const re = new RegExp(`\\b${name}\\b`, 'g'); let u;
    while ((u = re.exec(after))) {
      const next = after[u.index + name.length];
      if (next === '.' && after[u.index + name.length + 1] !== '.') continue;
      const before = after.slice(Math.max(0, u.index - 160), u.index);
      if (/\.\w+\(\s*(?:[^()]*,\s*)?$/.test(before) && !/\.(push|unshift|set|add|delete|splice|concat)\(\s*$/.test(before.replace(/\s+$/, '')) && !/(push|unshift|splice)\([^()]*$/.test(before)) continue;
      return null; // returned, stored, pushed, passed to a plain function: it may live past this frame
    }
    return { indent: m[1], kw: m[2], name, ns: m[4], type: m[5], args: m[6].trim() };
  }
  const lineStartIndex = (src, line) => { let i = 0; for (let k = 1; k < line; k += 1) i = src.indexOf('\n', i) + 1; return i; };

  // ---------- the doctor ----------
  const n0 = (x) => Math.round(x).toLocaleString('en-US');
  const mb = (x) => (x >= 10 ? n0(x) : (Math.round(x * 10) / 10).toString());
  // impact: ms lost per second of play (steady costs × frames per second; stutters × 3, they're what you feel)
  function doctor(R, scans = []) {
    const out = [];
    const S = R.scene || {};
    const fps = Math.max(1, Math.min(R.fps || R.hz || 60, R.hz || 240));
    const add = (f) => out.push({ ...f, impact: Math.round((f.impact || 0) * 10) / 10 });
    const late = (list) => (list || []).filter((x) => x.late !== false);
    const at = (t) => `${(t / 1000).toFixed(1)} s`;

    // draw calls: groups of meshes with one geometry and material are one instanced draw
    const calls = S.calls || 0;
    if (calls > 400 || (S.instancing || []).some((g) => g.n >= 50)) {
      const groups = (S.instancing || []).filter((g) => g.n >= 10);
      const save = groups.reduce((a, g) => a + g.n - 1, 0);
      const top = groups[0];
      const merge = (S.merge || []).filter((g) => g.n >= 20)[0];
      const title = top
        ? `${n0(calls)} draw calls a frame: ${n0(top.n)} meshes share one geometry and material${top.name ? ` (${top.name})` : ''} — instance them (≈ −${n0(save)} calls)`
        : merge ? `${n0(calls)} draw calls a frame: ${n0(merge.n)} meshes share a material — merge their geometry (≈ −${n0(merge.n - 1)} calls)` : `${n0(calls)} draw calls a frame`;
      add({ id: 'drawcalls', kind: 'cpu', impact: (top ? save : merge ? merge.n - 1 : calls - 400) * 0.012 * fps, title,
        fix: top ? 'Make one THREE.InstancedMesh(geometry, material, count) and set each copy with setMatrixAt(i, matrix) (then instanceMatrix.needsUpdate = true when they move).' : merge ? 'Merge static meshes with BufferGeometryUtils.mergeGeometries, or give them one material and instance them.' : 'Fewer objects: merge static parts, instance repeated ones, hide what is off-screen.',
        snippet: top ? instancingSnippet(top) : null, ask: true });
    }
    // garbage
    const hitsMath = scans.filter((h) => h.kind !== 'heavy');
    const heavy = scans.filter((h) => h.kind === 'heavy');
    if (heavy.length) {
      const h = heavy[0];
      add({ id: 'heavy-alloc', kind: 'memory', impact: 4 * fps, title: `new ${h.what} every frame in ${h.fn}() (line ${h.line}) — GPU memory made and thrown away each frame`, line: h.line, layer: h.layer,
        fix: `Make the ${h.what} once, outside ${h.fn}(), and change it in place (or reuse a pool); dispose() what you remove.`, ask: true });
    }
    const A = R.alloc || {};
    if (A.mbps >= 1 || hitsMath.length && A.mbps >= 0.3 || (R.stutters?.by?.gc?.n || 0) >= 2) {
      const h = hitsMath[0];
      const gcMs = (R.stutters?.by?.gc?.ms || 0) / Math.max(1, R.secs || 1);
      const what = h ? `new ${h.what === 'clone()' ? 'clone()' : h.what} every frame in ${h.fn}()${h.line ? ` (line ${h.line})` : ''} — ` : '';
      add({ id: 'garbage', kind: 'memory', impact: Math.max(gcMs * 3, A.mbps * 0.6), title: `${what}≈ ${mb(A.mbps)} MB/s of garbage${A.gcs ? ` (${A.gcs} garbage collections${R.stutters?.by?.gc?.n ? `, ${R.stutters.by.gc.n} of them stutters` : ''})` : ''}`,
        fix: h ? `Make it once outside ${h.fn}() and reuse it: const _v = new THREE.${h.what === 'clone()' ? 'Vector3' : h.what}(); then _v.set(…) / _v.copy(…) inside the loop.` : 'Find what the frame loop creates (new Vector3, arrays, objects, closures, clone()) and reuse it.',
        hits: hitsMath.slice(0, 4).map((x) => ({ fn: x.fn, line: x.line, what: x.what, layer: x.layer, hoist: Boolean(x.hoist) })),
        lab: hitsMath.some((x) => x.hoist) ? { kind: 'hoist', label: 'Reuse them' } : null });
    }
    // shaders compiled during play
    const shL = late(R.shaders?.late);
    if (shL.length) {
      const st = (x) => Math.max(x.ms || 0, x.stall || 0);
      const worst = shL.reduce((a, b) => (st(b) > st(a) ? b : a));
      const total = shL.reduce((a, b) => a + st(b), 0);
      add({ id: 'shader-late', kind: 'stutter', impact: (total / Math.max(1, R.secs)) * 3 + st(worst) * 0.1, title: `${shL.length === 1 ? 'A shader compiled' : `${shL.length} shaders compiled`} mid-play: a ${n0(st(worst))} ms freeze at ${at(worst.t)} (a new material or light appeared)`,
        fix: 'Compile everything while loading: add every object (visible = false if it shows later), then await renderer.compileAsync(scene, camera) before the game starts; don\'t add or remove lights during play.',
        snippet: 'await renderer.compileAsync(scene, camera); // after everything is added, before the first frame' });
    }
    const txL = late(R.textures?.late);
    if (txL.length) {
      const st = (x) => Math.max(x.ms || 0, x.stall || 0);
      const worst = txL.reduce((a, b) => (st(b) > st(a) ? b : a));
      const total = txL.reduce((a, b) => a + st(b), 0);
      add({ id: 'texture-late', kind: 'stutter', impact: (total / Math.max(1, R.secs)) * 3 + st(worst) * 0.1, title: `${/^8/.test(String(worst.w || '')) ? 'An' : 'A'} ${worst.w && worst.h ? `${worst.w}×${worst.h} ` : ''}texture was uploaded mid-play: a ${n0(st(worst))} ms freeze at ${at(worst.t)}${txL.length > 1 ? ` (${txL.length} uploads, ${n0(total)} ms in all)` : ''}`,
        fix: 'Upload it while loading: renderer.initTexture(texture) right after it loads; smaller (2048) or compressed (KTX2) textures upload far faster.',
        snippet: 'renderer.initTexture(texture); // as soon as it has loaded, before it is shown' });
    }
    // huge textures
    const big = (S.textures || []).filter((t) => Math.max(t.w, t.h) > 4096);
    if (big.length) {
      const memMB = big.reduce((a, t) => a + (t.w * t.h * 4 * 1.33) / 1048576, 0);
      const k = Math.max(...big.map((t) => Math.max(t.w, t.h)));
      add({ id: 'texture-big', kind: 'memory', impact: memMB / 40, title: `${big.length === 1 ? 'A' : big.length} ${k >= 8000 ? '8K' : `${Math.round(k / 1024)}K`} texture${big.length === 1 ? '' : 's'} (≈ ${n0(memMB)} MB of graphics memory with mipmaps${big[0].name ? `: ${big[0].name}` : ''})`,
        fix: 'Use 2048 or 4096 at most (nobody sees 8K on a 1080p–4K screen), or KTX2 / Basis compressed textures (4–8× less memory, faster uploads).' });
    }
    // pixel ratio
    if (S.pr && S.screen) {
      const px = (S.buffer?.[0] || 0) * (S.buffer?.[1] || 0);
      const scr = S.screen[0] * S.screen[1] * (S.dpr || 1) ** 2;
      if (S.pr > 2 || (px > scr * 1.1 && px > 2e6)) {
        add({ id: 'pixel-ratio', kind: 'gpu', impact: (R.gpuBound ? 6 : 2) * Math.max(1, px / Math.max(1, scr)) * (fps / 60), title: `Pixel ratio ${S.pr} on a ${S.screen[0] * (S.dpr || 1)}×${S.screen[1] * (S.dpr || 1)} screen: ${mb(px / 1e6)} million pixels shaded per frame`,
          fix: 'renderer.setPixelRatio(Math.min(devicePixelRatio, 2)): above 2 nobody sees the difference, every pixel still costs.', lab: { kind: 'pr-cap', label: 'Cap at 2' } });
      }
    }
    // shadows redrawn although nothing moves
    const sh = S.shadows;
    if (sh?.enabled && sh.everyFrame && sh.lights?.length && !sh.lightsMove && !sh.castersMove) {
      const size = Math.max(...sh.lights.map((l) => l.size || 512));
      add({ id: 'shadows-static', kind: 'gpu', impact: (sh.casters || 1) * sh.lights.length * 0.01 * fps + size / 1024, title: `Shadow map${sh.lights.length > 1 ? 's' : ''} ${size} redrawn every frame although lights and shadow casters don't move`,
        fix: 'renderer.shadowMap.autoUpdate = false; then renderer.shadowMap.needsUpdate = true only when a light or a caster moves.', lab: { kind: 'shadow-once', label: 'Draw shadows once' } });
    } else if (sh?.enabled && R.gpuBound && (sh.lights || []).some((l) => (l.size || 0) >= 4096)) {
      add({ id: 'shadow-size', kind: 'gpu', impact: 3 * (fps / 60), title: 'Shadow maps of 4096 while the graphics card is the limit', fix: 'light.shadow.mapSize.set(2048, 2048) and a tighter shadow camera (shadow.camera.left/right/top/bottom) keep the same sharpness for a quarter of the work.' });
    }
    // transparency
    if ((S.transparent || 0) >= 200) {
      add({ id: 'transparent', kind: 'cpu', impact: S.transparent * 0.003 * fps / 10, title: `Transparent sorting of ${n0(S.transparent)} objects every frame (and overdraw)`,
        fix: 'Use alphaTest (cut-outs) or opaque materials where you can; many same transparent things → one InstancedMesh or Points; depthWrite: false on additive effects.' });
    }
    // long JS tasks
    const longs = R.long || [];
    if (longs.length) {
      const byFn = new Map();
      for (const l of longs) { const k = l.fn || '(unnamed)'; const b = byFn.get(k) || { n: 0, ms: 0, worst: 0, fn: l.fn, url: l.url }; b.n += 1; b.ms += l.ms; b.worst = Math.max(b.worst, l.ms); byFn.set(k, b); }
      const top = [...byFn.values()].sort((a, b) => b.ms - a.ms)[0];
      add({ id: 'long-js', kind: 'stutter', impact: (top.ms / Math.max(1, R.secs)) * 3, title: `${top.fn ? `${top.fn}()` : 'Script'} ran ${n0(top.worst)} ms in one go${top.n > 1 ? ` (${top.n} times)` : ''}`,
        fix: 'Spread the work over frames, precompute it while loading, or move it to a Worker; nothing in a frame should run over a few ms.' });
    }
    // layout / paint in a game window
    const L = R.layout || {};
    if ((L.ms || 0) > 30 || (L.mutations || 0) / Math.max(1, R.secs) > 20) {
      add({ id: 'layout', kind: 'cpu', impact: (L.ms || 0) / Math.max(1, R.secs) + (L.mutations || 0) / Math.max(1, R.secs) * 0.02, title: `The page around the game changes ${n0((L.mutations || 0) / Math.max(1, R.secs))} times a second (HUD text / elements)${L.ms ? `: ${n0(L.ms)} ms of layout and paint` : ''}`,
        fix: 'Write a HUD value only when it changes, move things with transform / opacity, or draw the HUD in the canvas.' });
    }
    // GPU-bound
    if (R.gpuBound) {
      add({ id: 'gpu-bound', kind: 'gpu', impact: Math.max(1, (R.dtMed - R.budget)) * fps / 4, title: `The graphics card is the limit: frames are ready on time and shown late (${R.fps} fps for ${R.hz} Hz)`,
        fix: ['lower the pixel ratio', S.post ? 'fewer post-processing passes' : null, sh?.enabled ? 'smaller shadow maps' : null, S.aa ? 'antialias off (or FXAA) at a high pixel ratio' : null].filter(Boolean).join(', ') + '.' });
    }
    if ((S.programs || 0) > 40) add({ id: 'programs', kind: 'cpu', impact: 1, title: `${S.programs} shader programs: materials that differ by small settings each need their own`, fix: 'Share materials between meshes (same type and options); vary color through instance colors or vertex colors.' });
    return out.sort((a, b) => b.impact - a.impact);
  }
  function instancingSnippet(g) {
    return `// ${g.n} copies of one mesh as one draw call\nconst inst = new THREE.InstancedMesh(geometry, material, ${g.n});\nconst m = new THREE.Matrix4();\nfor (let i = 0; i < ${g.n}; i++) { m.compose(pos[i], quat[i], scale[i]); inst.setMatrixAt(i, m); }\nscene.add(inst);`;
  }

  // ---------- max fidelity (only ever applied on the owner's click) ----------
  function fidelity(R) {
    const S = R.scene || {};
    if (!S.pr) return [];
    const room = !R.gpuBound && (R.workMed || 0) < R.budget * 0.5 && (R.onTime ?? 100) >= 90;
    const cost = room ? '' : ' (costs graphics time: little headroom now)';
    const out = [];
    if (S.dpr && S.pr < S.dpr - 0.01) out.push({ id: 'max-pr', title: `Sharp on this screen: pixel ratio ${S.pr} → ${S.dpr}${cost}`, live: { pr: S.dpr }, lab: { kind: 'pr-display', label: 'Use the screen\'s' } });
    if (S.aa === false) out.push({ id: 'max-aa', title: `Smooth edges: MSAA (antialias: true)${cost}`, lab: { kind: 'aa', label: 'Antialias' } });
    if (S.toneMapping === 0 || S.toneMapping === 'none') out.push({ id: 'max-tone', title: 'Filmic light: ACES tone mapping (highlights roll off instead of clipping)', live: { tone: 'aces' }, lab: { kind: 'tone', label: 'ACES' } });
    if (S.colorSpace && !/srgb/i.test(S.colorSpace)) out.push({ id: 'max-color', title: 'Correct colors: sRGB output color space', live: { color: 'srgb' }, lab: { kind: 'color', label: 'sRGB' } });
    if (S.shadows?.enabled && S.shadows.type != null && S.shadows.type < 2) out.push({ id: 'max-shadow', title: `Soft shadow edges: PCFSoftShadowMap${cost}`, live: { shadowType: 2 }, lab: { kind: 'shadow-soft', label: 'Soft shadows' } });
    if (S.shadows?.enabled && (S.shadows.lights || []).some((l) => (l.size || 512) < 2048)) out.push({ id: 'max-shadow-size', title: `Sharper shadows: maps of 2048${cost}`, live: { shadowSize: 2048 } });
    if (S.aniso && S.aniso.max > 1 && S.aniso.low > 0) out.push({ id: 'max-aniso', title: `Crisp textures at grazing angles: anisotropy ${S.aniso.max} on ${S.aniso.low} texture${S.aniso.low === 1 ? '' : 's'}`, live: { aniso: S.aniso.max } });
    return out;
  }

  // ---------- one safe fix to a Lab layer's code (null: not safely) ----------
  const RENDERER = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:THREE\.)?WebGLRenderer\s*\(/;
  // the index just after the statement that made the renderer
  function afterRenderer(code) {
    const m = RENDERER.exec(code);
    if (!m) return null;
    let depth = 0; let k = m.index + m[0].length - 1;
    for (; k < code.length; k += 1) { if (code[k] === '(') depth += 1; else if (code[k] === ')') { depth -= 1; if (depth === 0) break; } }
    const nl = code.indexOf('\n', k);
    return { name: m[1], at: nl < 0 ? code.length : nl + 1, open: m.index + m[0].length - 1, close: k };
  }
  const insertAfterRenderer = (code, line, mark) => {
    if (code.includes(mark)) return null;
    const r = afterRenderer(code);
    if (!r) return null;
    return code.slice(0, r.at) + line.replace(/\$R/g, r.name) + '\n' + code.slice(r.at);
  };
  function patch(code, kind, arg = {}) {
    const src = String(code || '');
    if (kind === 'pr-cap' || kind === 'pr-display') {
      const want = kind === 'pr-cap' ? (v) => `Math.min(${v}, 2)` : () => 'devicePixelRatio';
      const re = /\.setPixelRatio\(([^;\n]*)\)/;
      const m = re.exec(src);
      if (m) {
        const inner = m[1].trim();
        if (kind === 'pr-cap' && /Math\.min\([^,]*,\s*2\)|Math\.min\(\s*2\s*,/.test(inner)) return null;
        if (kind === 'pr-display' && inner === 'devicePixelRatio') return null;
        return src.replace(re, `.setPixelRatio(${want(inner)})`);
      }
      return insertAfterRenderer(src, `$R.setPixelRatio(${kind === 'pr-cap' ? 'Math.min(devicePixelRatio, 2)' : 'devicePixelRatio'}); // ▶ game perf`, '.setPixelRatio(');
    }
    if (kind === 'shadow-once') return insertAfterRenderer(src, '$R.shadowMap.autoUpdate = false; $R.shadowMap.needsUpdate = true; // ▶ game perf: shadows drawn once (set needsUpdate = true when a light moves)', 'shadowMap.autoUpdate');
    if (kind === 'tone') return /toneMapping\s*=/.test(src) ? src.replace(/(\.toneMapping\s*=\s*)[\w.]+/, '$1THREE.ACESFilmicToneMapping') : insertAfterRenderer(src, '$R.toneMapping = THREE.ACESFilmicToneMapping; // ▶ max fidelity', 'toneMapping');
    if (kind === 'color') return /outputColorSpace\s*=/.test(src) ? src.replace(/(\.outputColorSpace\s*=\s*)[\w.'"]+/, '$1THREE.SRGBColorSpace') : insertAfterRenderer(src, '$R.outputColorSpace = THREE.SRGBColorSpace; // ▶ max fidelity', 'outputColorSpace');
    if (kind === 'shadow-soft') return /shadowMap\.type\s*=/.test(src) ? src.replace(/(shadowMap\.type\s*=\s*)[\w.]+/, '$1THREE.PCFSoftShadowMap') : insertAfterRenderer(src, '$R.shadowMap.type = THREE.PCFSoftShadowMap; // ▶ max fidelity', 'shadowMap.type');
    if (kind === 'aa') {
      const r = afterRenderer(src);
      if (!r) return null;
      const args = src.slice(r.open + 1, r.close).trim();
      if (/antialias\s*:\s*true/.test(args)) return null;
      const next = !args ? '{ antialias: true }' : /antialias\s*:/.test(args) ? args.replace(/antialias\s*:\s*[^,}]+/, 'antialias: true') : /^\{/.test(args) ? args.replace(/^\{\s*/, '{ antialias: true, ') : null;
      if (!next) return null;
      return src.slice(0, r.open + 1) + next + src.slice(r.close);
    }
    if (kind === 'hoist') return hoist(src, arg.lines || null);
    return null;
  }
  // per-frame `const v = new THREE.Vector3(…)` lines → one object made once above the function, set in place each frame
  function hoist(src, only) {
    const hits = scanSource(src, { max: 40 }).filter((h) => h.hoist && (!only || only.includes(h.line)));
    if (!hits.length) return null;
    const lines = src.split('\n');
    const bodies = frameBodies(src);
    const inserts = new Map(); // line index → [declarations]
    let n = 0;
    for (const h of hits) {
      const f = bodies.find((b) => b.name === h.fn && lineAt(src, b.start) <= h.line && lineAt(src, b.end) >= h.line) || bodies.find((b) => b.name === h.fn);
      const d = hoistable(src, f, h.line);
      if (!d) continue;
      n += 1;
      const tmp = `_gp${d.name[0].toUpperCase()}${d.name.slice(1)}${n}`;
      const set = d.type === 'Quaternion' ? (d.args ? `set(${d.args})` : 'identity()') : d.type === 'Matrix4' ? (d.args ? null : 'identity()') : d.type === 'Euler' ? `set(${d.args || '0, 0, 0'})` : d.type === 'Color' ? (d.args ? `set(${d.args})` : 'set(0xffffff)') : `set(${d.args || (d.type === 'Vector2' ? '0, 0' : d.type === 'Vector4' ? '0, 0, 0, 1' : '0, 0, 0')})`;
      if (!set) { n -= 1; continue; }
      lines[h.line - 1] = `${d.indent}${d.kw} ${d.name} = ${tmp}.${set}; // ▶ game perf: made once (above), reused each frame`;
      const declLine = lineAt(src, f.decl) - 1;
      const ind = (lines[declLine].match(/^\s*/) || [''])[0];
      (inserts.get(declLine) || inserts.set(declLine, []).get(declLine)).push(`${ind}const ${tmp} = new ${d.ns}${d.type}();`);
    }
    if (!n) return null;
    for (const k of [...inserts.keys()].sort((a, b) => b - a)) lines.splice(k, 0, ...inserts.get(k));
    return lines.join('\n');
  }
  // a patch as the owner / a director chat sees it (an html build: never applied by itself)
  function diff(a, b, ctx = 1) {
    const A = String(a).split('\n'); const B = String(b).split('\n');
    let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s += 1;
    let ea = A.length - 1; let eb = B.length - 1;
    while (ea >= s && eb >= s && A[ea] === B[eb]) { ea -= 1; eb -= 1; }
    const from = Math.max(0, s - ctx);
    const out = [`@@ line ${from + 1}`];
    for (let k = from; k < s; k += 1) out.push(`  ${A[k]}`);
    for (let k = s; k <= ea; k += 1) out.push(`- ${A[k]}`);
    for (let k = s; k <= eb; k += 1) out.push(`+ ${B[k]}`);
    for (let k = eb + 1; k < Math.min(B.length, eb + 1 + ctx); k += 1) out.push(`  ${B[k]}`);
    return out.join('\n');
  }

  // ---------- what a director reads ----------
  function compact(R, findings, { max = 5, name = '' } = {}) {
    if (!R) return 'No play session measured yet.';
    const by = Object.entries(R.stutters?.by || {}).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}`).join(', ');
    const S = R.scene || {};
    const head = `${name ? `${name}: ` : ''}${R.fps} fps on ${R.hz} Hz (${R.onTime}% on time, median ${R.dtMed} ms, budget ${R.budget}), ${R.stutters?.n || 0} stutters${by ? ` (${by})` : ''}; ${n0(S.calls || 0)} calls, ${(S.tris || 0) >= 1e6 ? `${mb(S.tris / 1e6)}M` : n0(S.tris || 0)} tris, pr ${S.pr ?? '?'}`;
    const short = (t) => { const s = String(t || ''); const k = s.search(/[.;:](\s|$)/); return (k > 20 && k < 110 ? s.slice(0, k) : s.length > 110 ? `${s.slice(0, 108)}…` : s); };
    const shown = [...findings.slice(0, max), ...findings.slice(max).filter((f) => f.lab)]; // (every one-click fix, even past the top few)
    const lines = shown.map((f, i) => `${i + 1}. [${f.id}${f.lab ? ', fix' : ''}] ${f.title}${f.hits?.length ? ` @ ${f.hits.map((h) => `${h.layer ? `${h.layer} ` : ''}l${h.line}`).join(', ')}` : f.line ? ` @ l${f.line}` : ''}${i < max ? ` → ${short(f.fix)}` : ''}`);
    return [head, ...(lines.length ? lines : ['Nothing to fix: it runs smooth.']), findings.some((f) => f.lab) ? 'three_do perf {op: "fix", id} applies a [fix] (undoable).' : null].filter(Boolean).join('\n');
  }

  return { attribute, CAUSE, summarize, guessHz, scanSource, frameBodies, doctor, fidelity, patch, diff, compact };
})();
if (typeof module !== 'undefined') module.exports = GamePerfCore;
