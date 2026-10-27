// The backstage: where a director chat's scene runs while you look at another chat's scene (chat-scenes.js routes
// the call here). It's a second, hidden Lab sandbox with the same director API shape the Lab gives
// tools/three-director.js (codeOf, updateLayer, report, shot, evalInSketch…), so the director's usual loop works:
// edit code, see errors / console / fps, take screenshots, evaluate code. Edits land in that chat's sketch (saved
// like any edit) and show the next time you open the chat. No music backstage (the demo beat plays) and no
// references; tools that need the scene on screen (sliders, looks, music, timeline, notes, input…) answer with a
// short note. One call at a time; the sandbox only runs while a background director works.
// (round 22, labcrew) ThreeBackstage.make(opts) makes another, independent stage: a crew (tools/three-crew.js) runs
// one per variation, in parallel, smaller and slower ({ long, cap }), on its own scene data ({ scenes }: the shape of
// ThreeLab.scenes), with its pictures sent to opts.onStill instead of a chat row. A call whose route names a stage
// (route.stage) goes to that stage.
function makeBackstage(opts = {}) {
  const LONG = opts.long || 640; // the backstage frame's long side in px (pictures for the model are ≤ 1280 anyway)
  const SC = () => opts.scenes || ThreeLab.scenes;
  const WAIT_MAX = 15;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const PROP_KEYS = ['name', 'visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
  const OK_TOOLS = new Set(['three_undo', 'three_get_code', 'three_read_code', 'three_search_code', 'three_edit_code', 'three_set_code', 'three_update_layer', 'three_console', 'three_screenshot', 'three_eval', 'three_layers', 'three_add_layer', 'three_remove_layer', 'three_set_frame', 'three_new_sketch', 'three_select_layer', 'three_media_info', 'three_sliders', 'three_references', // (round 72) sliders / references too
    // (round 73, labtools73) keyframes, presets, the timeline, looks, play-testing and contact sheets too; the helpers
    // that build on these (3D models, ◉ materials, physics, lights, camera moves) work backstage through them
    'three_keyframes', 'three_animate', 'three_timeline', 'three_timeline_edit', 'three_looks', 'three_input', 'three_contact_sheet']);

  let host = null; let box = null;
  let loaded = null; // { id, sig } of what the sandbox runs
  let errors = []; let consoleLines = []; let lastStats = null; let pendingShot = null;
  let started = null; let onStart = null; let waitDrawn = false; // resolves when a fresh page / a re-run layer draws (or fails)
  const evals = new Map();
  let chain = Promise.resolve();
  let idleTimer = 0;
  const log = []; // { at, chatId, sketch, tool } the last calls (/scene shows them)
  const timing = { calls: 0, ms: 0, shots: 0, shotMs: 0, shotTimeouts: 0, loads: 0, fresh: 0, loadMs: 0 }; // (round 73) where backstage time goes

  function onMessage(m) {
    // a fresh page has started at its first stats; a layer re-run in place once it has drawn
    if (onStart && (m.type === 'drawn' || m.type === 'error' || (m.type === 'stats' && !waitDrawn))) { const fn = onStart; onStart = null; fn(); }
    if (m.type === 'gpu-stuck') { loaded = null; return; } // (round 43, glrecover) the page is made again empty: the next call runs the scene in it
    if (m.type === 'error') errors.push({ layer: m.layer || null, message: String(m.message || ''), line: m.line || null });
    else if (m.type === 'console') { consoleLines.push({ level: m.level, text: clip(m.text, 500), layer: m.layer || null }); if (consoleLines.length > 60) consoleLines.splice(0, consoleLines.length - 60); }
    else if (m.type === 'stats') lastStats = { fps: m.fps, worstFrameMs: m.worst, renderMs: m.ms, drawCalls: m.calls, triangles: m.triangles, points: m.points, lines: m.lines, textures: m.textures, fpsCap: 15 };
    else if (m.type === 'shot' && pendingShot) { const fn = pendingShot; pendingShot = null; if (fn.t0) { timing.shots += 1; timing.shotMs += Math.round(performance.now() - fn.t0); } fn(m.dataUrl); }
    else if ((m.type === 'eval-result' || m.type === 'input-result') && evals.has(m.id)) { evals.get(m.id)(m); evals.delete(m.id); }
  }
  function frameOf(id) {
    const f = SC()?.frameOf(id) || 'fit';
    const z = ThreeMedia.SIZES.find((x) => x.id === f && x.w);
    return z ? { id: z.id, width: z.w, height: z.h } : { id: 'fit', width: 1280, height: 720 };
  }
  function ensureBox() {
    if (box) return;
    // behind the app (not off screen: a cross-origin frame outside the viewport stops drawing)
    host = el('div', { class: 'lab-backstage', attrs: { 'aria-hidden': 'true' } });
    document.body.append(host);
    // (round 16 "labperf": 15 frames a second is plenty for a scene nobody watches: the director's screenshots and
    // fps reads still work, the GPU does a quarter of the work)
    box = ThreeLab._sandbox(host, onMessage, () => `&dpr=1&cap=${opts.cap || 15}`);
  }
  // Nothing backstage for a minute: the page goes blank (no GPU or CPU while nothing works in the background).
  function sleepSoon() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (box) { box.frame.src = 'about:blank'; loaded = null; } }, opts.idleMs || 60000);
  }

  const sketchOf = (id) => { const s = SC()?.get(id); if (!s) throw new Error('This chat\'s sketch is gone (deleted?). Ask the owner, or make one with three_new_sketch.'); return s; };
  const layersOf = (s) => SC().layersOf(s);
  // (a precomp layer, tools/three-comp.js: what it shows counts as its code)
  const pcSpec = (L, s) => (L.precomp && typeof ThreeComp !== 'undefined' ? ThreeComp.specOf(L, s.id, { slotBase: 2000 + layersOf(s).indexOf(L) * 64 }) : null);
  const codeKey = (L, s) => (L.precomp ? `${L.code}|${pcSpec(L, s)?.sig || ''}` : L.code);
  const sigOf = (s) => JSON.stringify([layersOf(s).map((L) => [L.id, codeKey(L, s), L.visible, L.opacity, L.blend, L.x, L.y, L.scale, L.rotate, L.keys || null, L.overrides || null, L.camMoves || null, L.in, L.out, L.fadeIn, L.fadeOut, L.mask || null]), refsListOf(s.id).length, clockLenOf(s)]); // (round 73) keys, looks, refs, the clock

  // (round 73, labtools73) what the Lab on screen sends for a layer (tools/three.js layerProps): its keyframes (props
  // and sliders), time range, camera moves and ◉ looks, so a backstage scene draws the same frame as on screen
  const SLOT = 10000;
  const animKeys = (L) => Object.fromEntries(ThreeLayers.ANIM.filter((p) => L.keys?.[p]?.length).map((p) => [p, L.keys[p]]));
  const scanOf = (code) => { try { return typeof ThreeTweaks !== 'undefined' ? ThreeTweaks.scan(code) : { items: [] }; } catch { return { items: [] }; } };
  function sliderKeysOf(L) {
    const out = {};
    const ks = Object.entries(L.keys || {}).filter(([p, k]) => p.startsWith('s:') && k?.length);
    if (!ks.length) return out;
    const items = scanOf(L.code).items;
    for (const [prop, keys] of ks) {
      const i = items.findIndex((it) => it.key === prop.slice(2));
      if (i >= 0) out[(L.slot || 0) * SLOT + i] = { call: items[i].call, key: prop.slice(2), num: items[i].kind === 'color' && !items[i].quote, keys };
    }
    return out;
  }
  const specOf = (L, z) => ({ id: L.id, code: L.code, z, slot: L.slot ?? z, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, mask: L.mask || null, overrides: L.overrides || null,
    keys: animKeys(L), sliderKeys: sliderKeysOf(L), camMoves: L.camMoves?.length ? L.camMoves : null, in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0 });
  // (round 73) the scene's own timeline (or its keyframes): a silent clock in the backstage page, so keyframes play and a
  // frame at a time (three_screenshot at) is the frame the owner would see there. Songs stay out (no music backstage).
  let clock = null; // { id, len } the clock the page has
  const lastKeyT = (s) => { let m = 0; for (const L of layersOf(s)) for (const ks of Object.values(L.keys || {})) for (const k of ks || []) if (k.t > m) m = k.t; return m; };
  const clockLenOf = (s) => { const tl = SC()?.timelineOf?.(s.id); if (tl?.len) return tl.len; const last = lastKeyT(s); return last > 0 ? Math.max(10, Math.ceil(last + 1)) : 0; };
  function silentWav(seconds) {
    const rate = 8000; const n = Math.max(1, Math.round(seconds * rate));
    const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
    const w = (o, t) => { for (let i = 0; i < t.length; i += 1) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return buf;
  }
  function syncClock(s, { fresh = false } = {}) {
    const len = clockLenOf(s);
    if (!len) { if (clock && !fresh) { box.send({ type: 'media', cmd: 'pause' }); } clock = null; return; }
    if (!fresh && clock?.id === s.id && Math.abs(clock.len - len) < 1e-3) return;
    clock = { id: s.id, len, time: 0 };
    box.send({ type: 'media-load', buffer: silentWav(len), mime: 'audio/wav', video: false, name: 'scene timeline', startAt: 0, playing: true, loop: true, volume: 0, analysis: null });
  }
  // (round 73) the scene's references, so model / picture / video layers draw backstage too (bytes read once per stage,
  // only this scene's kept)
  const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', glb: 'model/gltf-binary', gltf: 'model/gltf+json', hdr: 'image/vnd.radiance', exr: 'image/x-exr' };
  const refBytes = new Map(); let refsSig = null;
  const refsListOf = (id) => (!opts.scenes && typeof ThreeLab !== 'undefined' && ThreeLab.refsOf ? ThreeLab.refsOf(id) : []);
  async function readRefs(s) {
    const list = refsListOf(s.id);
    const mine = new Set(list.map((r) => r.id));
    for (const id of [...refBytes.keys()]) if (!mine.has(id)) refBytes.delete(id);
    let total = 0;
    for (const r of list) {
      if (refBytes.has(r.id)) { total += refBytes.get(r.id).byteLength; continue; }
      if (total + (r.size || 0) > 300 * 1048576) continue; // a stage never holds more than this (videos are whole files)
      try { const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 400 * 1048576 }); const b = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); refBytes.set(r.id, b); total += b.byteLength; } catch { /* file gone */ }
    }
    return list.filter((r) => refBytes.has(r.id));
  }
  // sends them when they changed (fresh: a new page has none); true when they were sent
  async function sendRefs(s, { fresh = false } = {}) {
    const list = await readRefs(s);
    const sig = JSON.stringify([s.id, list.map((r) => [r.id, r.key]), s.palette || []]);
    if (!fresh && sig === refsSig) return false;
    refsSig = sig;
    if (!list.length && !(s.palette || []).length && fresh) return false;
    box.send({ type: 'refs', items: list.map((r) => ({ key: r.key, kind: r.kind, mime: MIMES[String(r.name).split('.').pop().toLowerCase()] || '', buffer: refBytes.get(r.id).slice(0) })), palette: s.palette || [] });
    return true;
  }
  // Runs the sketch: the first time (or another sketch, or forced) a fresh page with every layer bottom first; when
  // this sketch already runs here, only the layers whose code changed run again, in place (no new page: round 6 "live").
  // Returns true for a fresh page.
  // (round 73) one at a time: reading references waits, and two loads interleaving would re-run a layer twice
  let loadChain = Promise.resolve();
  function load(s, o = {}) {
    const p = loadChain.then(async () => { const t0 = performance.now(); const fresh = await load0(s, o); timing.loads += 1; if (fresh) timing.fresh += 1; timing.loadMs += Math.round(performance.now() - t0); return fresh; });
    loadChain = p.catch(() => {});
    return p;
  }
  async function load0(s, { force = false } = {}) {
    ensureBox();
    clearTimeout(idleTimer);
    const sig = sigOf(s);
    ran = false;
    if (!force && loaded?.id === s.id && loaded.sig === sig && box.ready) return false;
    const Ls = layersOf(s);
    if (!force && loaded?.id === s.id && loaded.codes && box.ready) {
      const ids = new Set(Ls.map((L) => L.id));
      const rerun = new Set(Ls.filter((L) => loaded.codes.get(L.id) !== codeKey(L, s)).map((L) => L.id));
      for (const id of loaded.codes.keys()) if (!ids.has(id)) box.send({ type: 'remove-layer', id });
      errors = errors.filter((e) => e.layer && ids.has(e.layer) && !rerun.has(e.layer));
      consoleLines = consoleLines.filter((l) => l.layer && ids.has(l.layer) && !rerun.has(l.layer));
      if (await sendRefs(s)) for (const L of Ls) if (/\brefs\.|refTexture\(/.test(L.code)) rerun.add(L.id); // (round 73) a new reference: its users run again
      syncClock(s);
      if (rerun.size) { waitDrawn = true; ran = true; started = new Promise((r) => { onStart = r; setTimeout(r, 6000); }); } else started = Promise.resolve();
      Ls.forEach((L, z) => {
        const { code, ...props } = specOf(L, z);
        if (rerun.has(L.id)) box.send({ type: 'hot-layer', layer: { code, ...props, ...(L.precomp ? { precomp: pcSpec(L, s) } : {}) } });
        else box.send({ type: 'layer-props', id: L.id, props });
      });
      loaded = { id: s.id, sig, codes: new Map(Ls.map((L) => [L.id, codeKey(L, s)])) };
      return false;
    }
    const f = frameOf(s.id);
    const k = LONG / Math.max(f.width, f.height);
    host.style.width = `${Math.round(f.width * k)}px`;
    host.style.height = `${Math.round(f.height * k)}px`;
    errors = []; consoleLines = []; lastStats = null; waitDrawn = false;
    await readRefs(s); // (round 73) read before the page starts (the page gets them before its layers run)
    started = new Promise((r) => { onStart = r; setTimeout(r, 9000); });
    ran = true;
    box.reload();
    box.send({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
    refsSig = null; await sendRefs(s, { fresh: true });
    syncClock(s, { fresh: true });
    box.send({ type: 'run-layers', layers: Ls.map((L, z) => ({ ...specOf(L, z), ...(L.precomp ? { precomp: pcSpec(L, s) } : {}) })) });
    loaded = { id: s.id, sig, codes: new Map(Ls.map((L) => [L.id, codeKey(L, s)])) };
    return true;
  }
  // a fresh page takes a moment to load three.js: wait for its first frame, then a little for the change to show
  // (round 73, labtools73) answers like the Lab on screen: at the change's first frame (a re-run layer's 'drawn', a fresh
  // page's first frame) + a short grace for its console lines, never a fixed half of the wait (backstage calls took
  // 1.3 s+ more than on screen); the wait stays the cap
  // (round 74, labcalls74) the grace is 100 ms (a page's console lines from its start and first frame come before its
  // 'drawn': one page's messages keep their order), and none when nothing ran again (props, keyframes, a removed layer)
  const GRACE = 100;
  let ran = false; // the last load ran code (a fresh page, a layer re-run)
  const mark = (k) => { if (!opts.scenes && typeof HubBridge !== 'undefined') HubBridge.mark?.(k); }; // (round 74, labcalls74) hop steps
  const settle = async (wait) => {
    if (!ran) return;
    const cap = Math.min(WAIT_MAX, Math.max(0.3, Number(wait) || 2.5)) * 1000;
    await Promise.race([started, sleep(cap)]);
    mark('page:drawn');
    await sleep(GRACE);
    mark('page:grace');
  };

  // ---------- the director API, for one sketch ----------
  // quiet: data only, nothing runs (an undo of a background chat's edit)
  function director(sketchId, route, { quiet = false } = {}) {
    const s = () => sketchOf(sketchId);
    const selId = () => { const Ls = layersOf(s()); const want = SC().selectedOf(sketchId); return (Ls.find((L) => L.id === want) || Ls.at(-1)).id; };
    function findLayer(ref) {
      const Ls = layersOf(s());
      if (ref == null || ref === '' || ref === 'selected') return Ls.find((L) => L.id === selId());
      if (ref === 'top') return Ls.at(-1);
      if (ref === 'bottom') return Ls[0];
      if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return Ls[Number(ref) - 1];
      const r = String(ref).toLowerCase();
      return Ls.find((L) => L.id === ref) || Ls.find((L) => L.name.toLowerCase() === r) || Ls.find((L) => L.name.toLowerCase().includes(r));
    }
    const must = (ref) => { const L = findLayer(ref); if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf(s()).map((x) => x.name).join(', ')}`); return L; };
    const layerName = (id) => layersOf(s()).find((L) => L.id === id)?.name;
    // (round 73, labtools73) the same rows as the Lab on screen gives (tools/three.js layersSummary): kinds, sliders,
    // keyframes, ◉ looks, time range, transform, so helpers (models, physics) find their layers backstage too
    const kindOf = (L) => [ThreeLayers.isFilter(L.code) && 'filter (changes the layers below it)', typeof ShaderLib !== 'undefined' && ShaderLib.isShader(L.code) && 'shader (GLSL: three_do shader)', typeof LabParticles !== 'undefined' && LabParticles.isParticles(L.code) && 'particles (GPU: three_do particles)', typeof LabPhysics !== 'undefined' && LabPhysics.isPhysics(L.code) && 'physics (three_do physics)', typeof LabType !== 'undefined' && LabType.isType(L.code) && 'type (text / lyrics: three_do type)', L.precomp && typeof ThreeComp !== 'undefined' && ThreeComp.isComp(L) && `precomp of ${ThreeComp.describe(L)} (three_do comp)`].filter(Boolean).pop() || null; // the last that fits, as on screen
    const sliderLabels = (L) => scanOf(L.code).items.filter((it) => it.key != null).map((it) => (ThreeTweaks.labelOf ? ThreeTweaks.labelOf(it) : it.label || it.key));
    const summary = () => layersOf(s()).map((L, i, all) => ({
      id: L.id, name: L.name, ...(kindOf(L) ? { kind: kindOf(L) } : {}), order: `${i + 1} of ${all.length} (1 = bottom)`, selected: L.id === selId(),
      ...(L.group ? { group: L.group.name } : {}), ...(L.solo ? { solo: true } : {}),
      visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal',
      ...(L.overrides?.['@look'] ? { materials: Object.fromEntries(Object.entries(L.overrides['@look']).map(([k, o]) => [k === '*' ? 'all meshes' : k, window.MatCore ? MatCore.describe(o) : o.k])) } : {}),
      plays: L.in == null && L.out == null ? 'whole song' : { from: L.in ?? 0, to: L.out ?? 'end', fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0 },
      ...(L.x || L.y || (L.scale ?? 1) !== 1 || L.rotate ? { transform: { x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0 } } : {}),
      sliders: sliderLabels(L),
      ...(Object.keys(L.keys || {}).length ? { keyframes: Object.fromEntries(Object.entries(L.keys).map(([p, ks]) => [p.replace(/^s:/, 'slider '), ks.map((k) => `${k.t}s=${k.v}${k.ease && k.ease !== 'ease' ? ` (${k.ease})` : ''}`)])) } : {}),
    }));
    const NOTE = `Backstage: this chat's scene "${s().name}" isn't on screen (the owner is looking at another chat), so it runs hidden, without music (its own timeline plays; a song scene gets the demo beat). Your changes are saved to it and show when the owner opens this chat.`;
    const report = () => ({
      sketch: s().name,
      layer: layerName(selId()),
      layers: summary(),
      errors: errors.map((e) => ({ layer: layerName(e.layer), message: e.message, line: e.line || undefined })),
      console: consoleLines.slice(-30).map((l) => `${l.layer && layersOf(s()).length > 1 ? `[${layerName(l.layer) || l.layer}] ` : ''}${l.level === 'log' ? '' : `[${l.level}] `}${l.text}`),
      stats: lastStats || 'no frames rendered yet (nothing calls renderer.render, or it failed)',
      frame: frameOf(sketchId),
      sliders: 'backstage: sliders show when the owner opens this chat',
      music: 'none backstage (demo 120 bpm beat)',
      note: NOTE,
    });
    const changed = () => SC().changed(sketchId);
    // (round 73) the scene's own timeline, made the moment something needs it (as the Lab's ensureTimeline does), and
    // made longer by keyframes past its end (fitClock)
    function ensureTimeline() {
      if (SC().songOf?.(sketchId) || SC().timelineOf?.(sketchId)) return;
      SC().setTimeline?.(sketchId, { len: Math.max(10, Math.ceil(lastKeyT(s()) - 1e-3)), fps: 30 });
    }
    function fitTimeline() {
      const tl = SC().timelineOf?.(sketchId);
      const last = lastKeyT(s());
      if (tl && !SC().songOf?.(sketchId) && last > tl.len + 1e-3) SC().setTimeline(sketchId, { ...tl, len: Math.ceil(last) });
    }
    const player = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director?.media : null);
    const mapPath = () => SC().songOf?.(sketchId) || `scene:${sketchId}`;
    // the timeline as saved: the scene's clock (or its song's saved grid / markers / cues; no analysis backstage)
    async function timeOf() {
      const tl = SC().timelineOf?.(sketchId); const song = SC().songOf?.(sketchId);
      const m = (await player()?.mapAt?.(mapPath())) || { grid: null, marks: { kick: [], snare: [], hit: [] }, cues: [] };
      let lp = null; try { const v = store.get(`three.loop:${mapPath()}`, null); if (v?.a != null) lp = { a: v.a, b: v.b }; } catch { /* none */ }
      const duration = tl?.len || Math.max(10, Math.ceil(lastKeyT(s())));
      const g = m.grid;
      const bpm = g?.bpm || 120; const bpb = g?.bpb || 4;
      const beats = [];
      if (g?.bpm) { const step = 60 / g.bpm; let t = (g.anchor || 0) % step; if (t < 0) t += step; for (; t <= duration + 1e-6 && beats.length < 4000; t += step) beats.push(Math.round(t * 1e4) / 1e4); }
      return { clock: !song, song: song ? String(song).split(/[\\/]/).pop() : null, duration, fps: tl?.fps || 30, bpm, bpb, beats, grid: g, marks: m.marks || {}, cues: m.cues || [], loop: lp };
    }
    const d = {
      backstage: true,
      building: () => Boolean(onStart), // (round 74, labcalls74) a fresh page / a re-run layer hasn't drawn yet
      built: (ms = 6000) => Promise.race([started, sleep(ms)]),
      codeOf(ref = null) { const L = must(ref); const x = s(); return { id: L.id, name: L.name, sketchId: x.id, sketch: x.name, code: L.code }; },
      getCode() { const L = must(null); return { sketch: s().name, layer: L.name, layers: summary(), frame: frameOf(sketchId), lines: L.code.split('\n').length, ...ThreeLab._util.codeOrOutline(L.code), note: NOTE }; },
      layers: () => ({ sketch: s().name, selected: layerName(selId()), layers: summary(), note: NOTE }),
      report,
      async updateLayer(ref, patch = {}, wait = 1.5) {
        const L = must(ref);
        for (const [k, v] of Object.entries(patch)) if (PROP_KEYS.includes(k)) L[k] = v;
        if (patch.code != null) L.code = String(patch.code);
        if (patch.order != null) {
          const Ls = layersOf(s());
          const rest = Ls.filter((x) => x !== L);
          const to = patch.order === 'top' ? rest.length : patch.order === 'bottom' ? 0 : Math.max(0, Math.min(rest.length, Number(patch.order) - 1));
          rest.splice(to, 0, L);
          Ls.splice(0, Ls.length, ...rest);
        }
        changed();
        if (quiet) return { updated: L.name, sketch: s().name };
        await load(s());
        await settle(wait);
        return { updated: L.name, ...report() };
      },
      async setCode(code, wait = 2.5) { return d.updateLayer(null, { code }, wait); },
      async addLayer({ name, code, template, props = {} }, wait = 2.5) {
        const Ls = layersOf(s());
        const t = code == null ? ([...ThreeLayers.TEMPLATES, ...ThreeLayers.FILTERS].find((x) => x.id === template) || ThreeLayers.TEMPLATES[0]) : null;
        const slot = Math.max(-1, ...Ls.map((L) => L.slot || 0)) + 1;
        let nm = name || t?.name || 'Layer'; let n = 2;
        while (Ls.some((L) => L.name === nm)) { nm = `${name || t?.name || 'Layer'} ${n}`; n += 1; }
        const L = ThreeLayers.defaults({ color: ThreeLayers.COLORS[slot % ThreeLayers.COLORS.length], slot, ...Object.fromEntries(Object.entries(props).filter(([k]) => PROP_KEYS.includes(k))), name: nm, code: code ?? t.code });
        Ls.push(L);
        changed();
        await load(s());
        await settle(wait);
        return { added: L.name, ...report() };
      },
      async removeLayer(ref) {
        const L = must(ref);
        const Ls = layersOf(s());
        if (Ls.length < 2) throw new Error('A sketch keeps at least one layer.');
        Ls.splice(Ls.indexOf(L), 1);
        changed();
        await load(s());
        await settle(1);
        return { removed: L.name, ...report() };
      },
      selectLayer(ref) { const L = must(ref); return { selected: L.name, note: 'Backstage: the selection is only for your next calls (the owner\'s selected layer stays).', ...d.getCode() }; },
      // (round 72, labbridge72) a layer's named tweak() controls read from its code; a move is written into the code (saved:
      // nobody is there to Save it), and the layer runs again here. Live-only states (♪ links, looks) need the scene on screen.
      sliders(ref, set) {
        const L = must(ref);
        if (typeof ThreeTweaks === 'undefined') throw new Error('Sliders need the scene on screen here: change the values in the code with three_edit_code.');
        const items = ThreeTweaks.scan(L.code).items.filter((it) => it.key != null);
        const view = () => items.map((it) => ({ key: it.key, label: ThreeTweaks.labelOf ? ThreeTweaks.labelOf(it) : it.label || it.key, group: it.group, value: it.orig, ...(it.kind === 'number' && it.range ? { min: it.range.min, max: it.range.max } : {}), ...(it.options ? { options: it.options } : {}) }));
        const moved = [];
        if (set && typeof set === 'object' && Object.keys(set).length) {
          const vals = items.map((it) => it.orig);
          for (const [k, v] of Object.entries(set)) {
            const i = items.findIndex((it) => String(it.key).toLowerCase() === String(k).toLowerCase());
            if (i < 0) continue;
            const it = items[i];
            let nv = it.kind === 'number' ? Number(v) : it.kind === 'bool' ? (v === true || v === 'true' || v === 1 || v === 'on') : String(v);
            if (it.kind === 'number' && !Number.isFinite(nv)) continue;
            if (it.kind === 'color') { if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(nv)) continue; nv = nv.length === 4 ? `#${[...nv.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : nv.toLowerCase(); }
            vals[i] = nv; moved.push(it.key);
          }
          if (moved.length) {
            L.code = ThreeTweaks.applyValues(L.code, items, vals);
            changed();
            if (!quiet) load(s());
            items.forEach((it, i) => { it.orig = vals[i]; });
          }
        }
        return { layer: L.name, changed: moved, sliders: view(), note: moved.length ? 'Backstage: written into the layer\'s code (saved).' : undefined };
      },
      evalInSketch: (code) => new Promise((resolve) => {
        const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        evals.set(id, (m) => resolve(m.ok ? { ok: true, value: m.value } : { ok: false, error: m.error }));
        box.send({ type: 'eval', code, id });
        setTimeout(() => { if (evals.delete(id)) resolve({ ok: false, error: 'The sketch did not answer (is it running?)' }); }, 6000);
      }),
      // (round 73, labtools73) the preview's own small JPEG (its 'thumb' channel, as the Lab on screen gives the director):
      // a full-size PNG of a layered scene waited for full-quality frames and took seconds here
      shotSmall: (max) => smallShot(max, 10000),
      shot: () => new Promise((resolve) => {
        const prev = pendingShot;
        const mine = (url) => { prev?.(url); resolve(url); };
        pendingShot = mine;
        const t0 = performance.now();
        box.send({ type: 'screenshot', tag: 'get' });
        // (round 73) a page busy building a layer (a model loading, shaders compiling) can take a while: 10 s, not 5
        setTimeout(() => { if (pendingShot === mine) { pendingShot = null; timing.shotTimeouts += 1; mine(null); } }, 10000);
        pendingShot.t0 = t0;
      }),
      // (round 73, labtools73) the scene's own clock backstage (see syncClock): seeking it is what a frame at a time needs
      media: {
        get loaded() { return Boolean(clock && clock.id === sketchId); },
        get time() { return clock?.time || 0; },
        info: () => (clock && clock.id === sketchId ? { loaded: false, time: clock.time || 0, sceneTimeline: { seconds: clock.len, fps: SC().timelineOf?.(sketchId)?.fps || 30, time: clock.time || 0 }, note: 'Backstage: the scene\'s own timeline, silent.' } : { loaded: false, note: 'no music backstage' }),
        seek(t) { if (!clock || clock.id !== sketchId) return; clock.time = Math.max(0, Math.min(clock.len, Number(t) || 0)); box.send({ type: 'media', cmd: 'seek', value: clock.time }); },
        toggle() {}, setLoop: () => false,
      },
      // ---------- (round 73, labtools73) keyframes, animation presets, the timeline: the scene's data, as on screen ----------
      setKeyframes(ref, property, keys, clear) {
        const L = must(ref);
        let prop = String(property || '');
        if (!ThreeLayers.ANIM.includes(prop)) {
          const items = scanOf(L.code).items.filter((it) => it.key != null);
          const it = items.find((x) => x.key === prop || String(ThreeTweaks.labelOf?.(x) || x.label || x.key).toLowerCase() === prop.toLowerCase());
          if (!it) throw new Error(`No property "${property}" on "${L.name}". Use opacity, x, y, scale, rotate or a slider: ${items.map((x) => `${x.key} (${ThreeTweaks.labelOf?.(x) || x.key})`).join(', ') || 'none'}`);
          prop = `s:${it.key}`;
        }
        const list = clear ? [] : (keys || []).map((k) => ({ t: Math.round(Number(k.time) * 1000) / 1000, v: k.value, ease: (ThreeLayers.EASE_IDS || ['linear', 'ease', 'hold']).includes(k.ease) ? k.ease : 'ease' })).filter((k) => Number.isFinite(k.t) && k.v != null).sort((a, b) => a.t - b.t);
        L.keys ||= {};
        if (list.length) L.keys[prop] = list; else delete L.keys[prop];
        if (list.length) ensureTimeline();
        fitTimeline();
        changed();
        if (!quiet) load(s());
        return { layer: L.name, property: prop.replace(/^s:/, ''), keyframes: list.length, ...report() };
      },
      async applyPreset(ref, presetId) {
        const L = must(ref);
        const pr = ThreeLayers.PRESETS.find((x) => x.id === presetId);
        if (!pr) throw new Error(`Unknown preset "${presetId}" (or no song). Presets: ${ThreeLayers.PRESETS.map((x) => x.id).join(', ')}`);
        ensureTimeline();
        const T = await timeOf();
        const lp = T.loop;
        const a = L.in ?? lp?.a ?? 0;
        const b = L.out ?? (L.in != null ? T.duration : lp?.b ?? T.duration);
        const beat = 60 / T.bpm;
        const inR = (list, lo, hi) => (list || []).filter((t) => t >= lo - 1e-4 && t <= hi + 1e-4);
        const base = (p) => (p.startsWith('s:') ? scanOf(L.code).items.find((it) => it.key === p.slice(2))?.orig : L[p] ?? (p === 'scale' || p === 'opacity' ? 1 : 0));
        const out = pr.make({ a, b, beat, bar: beat * T.bpb, beats: inR(T.beats, a, b - 1e-3), kicks: inR(T.marks.kick, a, b), snares: inR(T.marks.snare, a, b), base });
        L.keys ||= {};
        const EPS = ThreeLayers.KEY_EPS;
        for (const [prop, ks] of Object.entries(out)) {
          if (!ks.length) continue;
          const lo = Math.min(...ks.map((x) => x.t)); const hi = Math.max(...ks.map((x) => x.t));
          const kept = (L.keys[prop] || []).filter((x) => x.t < lo - EPS || x.t > hi + EPS);
          L.keys[prop] = [...kept, ...ks].sort((p, q) => p.t - q.t).filter((x, i, arr) => i === 0 || Math.abs(x.t - arr[i - 1].t) >= EPS);
        }
        L.lanes = [...new Set([...(L.lanes || (L.lane ? [L.lane] : [])), ...Object.keys(out)])];
        delete L.lane;
        changed();
        if (!quiet) load(s());
        return { layer: L.name, preset: pr.name, from: a, to: b, props: Object.keys(out), ...report() };
      },
      async timeline(range) {
        const T = await timeOf();
        const r = range || {};
        const inR = (list) => (list || []).filter((t) => t >= (r.from ?? 0) - 1e-4 && t <= (r.to ?? Infinity) + 1e-4);
        return {
          duration: T.duration, ...(T.clock ? { sceneTimeline: { seconds: T.duration, fps: T.fps } } : { song: T.song || 'none (demo beat backstage)' }),
          grid: T.grid ? { bpm: T.grid.bpm, downbeat: T.grid.anchor, beatsPerBar: T.grid.bpb || 4, setBy: 'user' } : { bpm: T.bpm, setBy: T.clock ? 'scene timeline' : 'auto-detected when the scene is on screen' },
          markers: Object.fromEntries(Object.entries(T.marks).map(([k, v]) => [k, inR(v)])),
          cues: T.cues.map((c) => ({ time: c.t, name: c.name })),
          loop: T.loop ? { start: T.loop.a, end: T.loop.b } : null,
          layers: summary().map((x) => ({ name: x.name, plays: x.plays, keyframes: x.keyframes, lanes: (() => { const L = layersOf(s()).find((y) => y.id === x.id); return (L?.lanes || (L?.lane ? [L.lane] : [])).map((p) => p.replace(/^s:/, 'slider ')); })() })),
          note: 'Backstage: the scene\'s timeline as saved (the playhead, zoom and speed are the Lab\'s on screen).',
        };
      },
      async timelineEdit({ markers, loop, zoom, lane, cues, speed, length, grid } = {}) {
        const did = []; const skipped = [];
        if (length != null) { if (SC().songOf(sketchId)) throw new Error('This scene plays on its song: its length is the song\'s.'); ensureTimeline(); SC().setTimeline(sketchId, { ...(SC().timelineOf(sketchId) || {}), len: Number(length) }); did.push('length'); }
        if (cues || markers) {
          const P = player();
          if (!P?.editMapAt) throw new Error('Cues and markers of a scene that isn\'t on screen need the Lab loaded.');
          if (!SC().songOf(sketchId)) ensureTimeline();
          await P.editMapAt(mapPath(), { cues: cues ? { add: cues.add || [], remove: cues.remove || [], clear: Boolean(cues.clear) } : null, markers: markers ? { add: markers.add || {}, remove: markers.remove || {}, clear: markers.clear || [] } : null });
          if (markers) did.push('markers');
          if (cues) did.push('cues');
        }
        if (lane) {
          const L = must(lane.layer);
          let prop = lane.property || null;
          const lanes = L.lanes || (L.lane ? [L.lane] : []);
          const animated = Object.keys(L.keys || {}).filter((p) => L.keys[p]?.length);
          if (prop === 'all') L.lanes = [...new Set([...lanes, ...animated])];
          else if (!prop) L.lanes = [];
          else {
            if (!ThreeLayers.ANIM_META[prop]) { const it = scanOf(L.code).items.find((y) => y.key != null && (y.key === prop || y.key === String(prop).replace(/^s:/, '') || String(ThreeTweaks.labelOf?.(y) || y.key).toLowerCase() === String(prop).toLowerCase())); if (!it) throw new Error(`No property "${prop}" on "${L.name}".`); prop = `s:${it.key}`; }
            L.lanes = [...new Set((lane.show === false ? lanes.filter((p) => p !== prop) : [...lanes, prop]).filter(Boolean))];
          }
          delete L.lane;
          changed();
          did.push('lane');
        }
        if (grid != null) skipped.push('grid');
        if (loop !== undefined) skipped.push('loop');
        if (zoom !== undefined) skipped.push('zoom');
        if (speed) skipped.push('speed');
        if (!did.length && skipped.length) throw new Error(`${skipped.join(', ')}: the song's beats and how the Lab on screen plays the timeline, so it needs this scene on screen (the owner is looking at another one). Cues, markers, lanes and the length work backstage.`);
        return { changed: did, ...(skipped.length ? { skipped: `${skipped.join(', ')} (need the scene on screen; left as they are)` } : {}), ...(await d.timeline()) };
      },
      // the slider looks saved with the layer (its 🎨 menu): listed backstage; apply / save need its slider panel
      looks(ref, action = 'list') {
        const L = must(ref);
        const ex = SC().extrasOf?.(sketchId) || {};
        const saved = (L.id === 'main' ? ex.looks : ex.layers?.[L.id]?.looks) || [];
        const list = (Array.isArray(saved) ? saved : Object.keys(saved).map((n) => ({ name: n }))).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
        if (action === 'list') return { looks: list };
        throw new Error(`looks ${action} needs this scene on screen (its slider panel keeps them); list works backstage.`);
      },
      inputToSketch: (actions) => new Promise((resolve) => {
        const id = `i${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        evals.set(id, (m) => resolve(m.ok === false ? { ok: false, error: m.error } : { ok: true, log: m.log || m.done || [] }));
        box.send({ type: 'input', actions, id });
        setTimeout(() => { if (evals.delete(id)) resolve({ ok: false, error: 'The sketch did not answer (is it running?)' }); }, 70000);
      }),
      openSketch() {},
      route,
    };
    return d;
  }

  // ---------- calls ----------
  // (round 73) a contact sheet backstage: frames of the scene's own timeline at its cues (or count over it, or times),
  // numbered, one picture (the Lab on screen does the same over the song)
  async function contactSheet(d, x, args) {
    await load(x); syncClock(x);
    const P = ThreeDirector.pictures;
    if (!d.media.loaded) { // no timeline: frames a moment apart, as it runs (as on screen)
      const cells = [];
      for (let i = 0; i < Math.min(8, Math.max(2, Number(args.count) || 6)); i += 1) { const url = (await d.shotSmall(400)) || (await d.shot()); if (url) cells.push(P.frameCanvas(await P.loadImg(url), { max: 400 })); await sleep(400); }
      if (!cells.length) return { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
      return { ok: true, images: [{ data: await P.jpeg(P.tile(cells, cells.map((_, i) => `${i + 1} · +${(i * 0.4).toFixed(1)} s`), 1024), 0.8), mime: 'image/jpeg' }], value: { frames: cells.length, note: 'Numbered left to right, top to bottom, 0.4 s apart (no timeline).' } };
    }
    const T = await d.timeline();
    const len = T.duration || 10;
    const count = Math.max(2, Math.min(16, Number(args.count) || 8));
    let times = Array.isArray(args.times) && args.times.length ? args.times.map(Number).filter(Number.isFinite) : (T.cues || []).map((c) => c.time);
    if (times.length < 2) times = Array.from({ length: count }, (_, i) => +((len * (i + 0.5)) / count).toFixed(2));
    times = times.slice(0, 16);
    const cells = []; const frames = [];
    for (const [i, t] of times.entries()) {
      d.media.seek(t); // (round 74, labcalls74) no fixed 380 ms: the page sets its clock at once, the picture is its next frame
      const url = (await d.shotSmall(400)) || (await d.shot());
      if (!url) continue;
      cells.push(P.frameCanvas(await P.loadImg(url), { max: 400 })); frames.push({ n: i + 1, time: t });
    }
    if (!cells.length) return { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
    const sheet = P.tile(cells, frames.map((f) => `${f.n} · ${f.time} s`), 1024);
    return { ok: true, images: [{ data: await P.jpeg(sheet, 0.8), mime: 'image/jpeg' }], value: { frames, note: 'Numbered left to right, top to bottom (backstage: the scene\'s own timeline).' } };
  }
  async function run(tool, args, route) {
    const x = sketchOf(route.sketchId);
    const d = director(route.sketchId, route);
    if (!OK_TOOLS.has(tool)) {
      return { ok: false, error: `${tool.replace(/^three_/, '')} needs this chat's scene on screen, and the owner is looking at another chat right now. Your scene "${x.name}" runs backstage, where code, layers, sliders, keyframes, the timeline's cues, 3D models, materials, physics, screenshots and eval all work. Tell the owner what's left, or carry on with those.` };
    }
    if (tool === 'three_new_sketch') {
      const s = SC().create({ name: String(args.name || 'Untitled'), code: String(args.code || ''), frame: SC().frameOf(route.sketchId) });
      route.sketchId = s.id;
      await load(s, { force: true });
      await settle(args.wait);
      return { ok: true, newSketchId: s.id, value: { ...director(s.id, route).report(), made: s.name } };
    }
    if (tool === 'three_set_frame') {
      if (!ThreeMedia.SIZES.some((z) => z.id === args.size)) return { ok: false, error: `size must be one of ${ThreeMedia.SIZES.map((z) => z.id).join(', ')}` };
      SC().setFrame(route.sketchId, args.size);
      await load(x, { force: true });
      await settle(1.2);
      // one line, like on screen (round 21): not the whole report
      const r = d.report(); const f = r.frame;
      return { ok: true, value: { frame: f?.width ? `${f.id || args.size} ${f.width}×${f.height}` : args.size, ...(r.errors?.length ? { errors: r.errors.slice(0, 4).map((e) => `${e.layer ? `[${e.layer}] ` : ''}${e.line ? `line ${e.line}: ` : ''}${clip(e.message, 200)}`) } : {}) } };
    }
    // (round 72, labbridge72) a file the owner gave in the chat goes into THIS scene's references (not the one on screen)
    if (tool === 'three_references') {
      const action = args.action || 'list';
      const list = () => ThreeLab.refsOf(route.sketchId).map((r) => ({ name: r.key, kind: r.kind, file: r.name, use: r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}` }));
      if (action === 'list') return { ok: true, value: { references: list(), note: 'Backstage: no pictures of them here (the scene uses them).' } };
      // (round 73) remove and a palette of colors work backstage too (a palette from a picture reads it on screen)
      if (action === 'remove') {
        const r = ThreeLab.refsOf(route.sketchId).find((y) => y.key === args.name || y.name === args.name);
        if (!r) return { ok: false, error: `No reference "${args.name}". References: ${list().map((y) => y.name).join(', ') || 'none'}` };
        if (!ThreeLab.removeReference?.(r.id, { sketchId: route.sketchId })) return { ok: false, error: 'That reference could not be removed here; open the scene in the Lab.' };
        return { ok: true, value: { references: list().map((y) => y.name) } };
      }
      if (action === 'palette' && !args.from) {
        const cols = (Array.isArray(args.colors) ? args.colors : String(args.coolors || '').split(/[^0-9a-f#]+/i)).map((c) => String(c).trim().replace(/^#?/, '#').toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 12);
        if (!cols.length) return { ok: false, error: 'No colors given (colors: ["#ff3d7f", …] or a coolors link).' };
        x.palette = cols; SC().changed(route.sketchId);
        return { ok: true, value: { palette: cols } };
      }
      if (action !== 'add') return { ok: false, error: `references ${action} needs this scene on screen; add, list, remove and palette (colors) work backstage.` };
      const p = String(args.path || '');
      const dir = await window.hub.attachmentsDir();
      if (!p.toLowerCase().startsWith(dir.toLowerCase())) return { ok: false, error: 'You can only add files the owner attached in this chat (their path is in the hub\'s attachments folder). Ask them to drop the file in the chat.' };
      const r = await ThreeLab.addReference(p, { key: args.name || undefined, sketchId: route.sketchId });
      return { ok: true, value: { added: r.key, kind: r.kind, scene: x.name, use: r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}`, note: 'Saved with this scene and usable in its code right away.' } };
    }
    if (tool === 'three_media_info') return { ok: true, value: { loaded: false, note: 'No music backstage: the song plays when the owner opens this chat.', song: SC().songOf(route.sketchId)?.split(/[\\/]/).pop() || 'none linked' } };
    if (await load(x)) await settle(1.2); // a fresh page: let it start before reading it
    mark('page:load');
    if (typeof ThreeDirector !== 'undefined') { const r = await ThreeDirector.handle(tool, args, d, { chatId: route.chatId, batch: route.batch }); if (r) return r; }
    if (tool === 'three_layers') return { ok: true, value: d.layers() };
    if (tool === 'three_get_code') return { ok: true, value: d.getCode() };
    if (tool === 'three_add_layer') return { ok: true, value: await d.addLayer({ name: args.name, code: args.code, template: args.template, props: args.settings || {} }, args.wait) };
    if (tool === 'three_remove_layer') return { ok: true, value: await d.removeLayer(args.layer) };
    if (tool === 'three_select_layer') return { ok: true, value: d.selectLayer(args.layer) };
    if (tool === 'three_eval') { const r = await d.evalInSketch(String(args.code || '')); return r.ok ? { ok: true, value: r.value } : r; }
    if (tool === 'three_console') return { ok: true, value: d.report() };
    if (tool === 'three_screenshot') {
      const url = await d.shot();
      return url ? { ok: true, images: [{ data: url.split(',')[1], mime: 'image/png' }], value: `Screenshot of "${x.name}" (backstage).` } : { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
    }
    // (round 73, labtools73) the timeline, its edits, looks and play-testing, as the Lab on screen answers them
    if (tool === 'three_timeline') return { ok: true, value: await d.timeline(args.from != null || args.to != null ? { from: args.from ?? 0, to: args.to ?? Infinity } : null) };
    if (tool === 'three_timeline_edit') { const v = await d.timelineEdit(args); if (d.media.loaded || clockLenOf(x)) await load(x); return { ok: true, value: v }; }
    if (tool === 'three_looks') return { ok: true, value: d.looks(args.layer, args.action || 'list', args.name) };
    if (tool === 'three_input') {
      const r = await d.inputToSketch(Array.isArray(args.actions) ? args.actions : []);
      if (!r.ok) return { ok: false, error: r.error };
      if (!args.screenshot) return { ok: true, value: { done: r.log } };
      const url = await d.shot();
      return { ok: true, value: { done: r.log }, ...(url ? { images: [{ data: url.split(',')[1], mime: 'image/png' }] } : {}) };
    }
    if (tool === 'three_contact_sheet') return contactSheet(d, x, args);
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  // A background chat's row shows a still of its scene (chat-scenes.js): refreshed after an edit lands here (at most
  // every few seconds per chat) and from the director's own screenshots, so its row tells what changed backstage.
  const EDITS = new Set(['three_edit_code', 'three_set_code', 'three_update_layer', 'three_add_layer', 'three_remove_layer', 'three_new_sketch', 'three_set_frame']);
  const stillAt = new Map();
  async function rowStill(tool, route, r) {
    if ((!opts.onStill && typeof ChatScenes === 'undefined') || !route.chatId || r?.ok === false || !box) return;
    const img = tool === 'three_screenshot' && r?.images?.[0];
    if (!img && (!EDITS.has(tool) || Date.now() - (stillAt.get(route.chatId) || 0) < 4000)) return;
    stillAt.set(route.chatId, Date.now());
    const url = img ? `data:${img.mime || 'image/png'};base64,${img.data}` : await smallShot(360, 3000); // (round 73) small, and never long: it is a row's picture (the next call waits behind it)
    if (url && opts.onStill) opts.onStill(url, route); else if (url) ChatScenes.setThumb(route.chatId, url);
  }
  // (round 74, labcalls74) the chat row's still is taken once the AI pauses (no call for 1.5 s), beside the calls, never
  // in front of one: in round 73 the next call waited behind it, up to its 3 s cap while the page was busy (a model
  // loading), ≈ 3 s lost after each edit. A director's own screenshot is the row's picture at once.
  let busy = 0; let stillTimer = 0; const stillWant = new Map(); // chat id → its last edit
  function stillSoon(tool, route, r) {
    if (tool === 'three_screenshot') { rowStill(tool, route, r).catch(() => {}); return; }
    if (!EDITS.has(tool) || r?.ok === false || !route?.chatId) return;
    stillWant.set(route.chatId, { tool, route, r });
    clearTimeout(stillTimer);
    const go = () => {
      if (busy) { stillTimer = setTimeout(go, 1500); return; }
      const all = [...stillWant.values()]; stillWant.clear();
      // (only the scene the page runs now: another chat's call may have loaded its own since)
      all.filter((w) => loaded?.id === w.route.sketchId).reduce((q, w) => q.then(() => rowStill(w.tool, w.route, w.r)).catch(() => {}), Promise.resolve());
    };
    stillTimer = setTimeout(go, 1500);
  }
  // One at a time: two background chats take turns with the sandbox.
  function handle(tool, args, route) {
    if (route?.stage && route.stage !== self) return route.stage.handle(tool, args, route); // a crew's own stage
    busy += 1;
    const p = chain.then(async () => {
      log.push({ at: Date.now(), chatId: route.chatId, sketch: route.sketchId, tool });
      if (log.length > 30) log.shift();
      const t0 = performance.now();
      try { return await run(tool, args || {}, route); } catch (err) { return { ok: false, error: err.message }; } finally { timing.calls += 1; timing.ms += Math.round(performance.now() - t0); busy -= 1; }
    });
    chain = p.then((r) => stillSoon(tool, route, r)).catch(() => {}).finally(sleepSoon);
    return p;
  }

  // (round 22) a small picture of what this stage runs now (the crew's live thumbnails): merged and encoded off the
  // page's frames by the preview (its 'thumb' channel), null when nothing runs
  function smallShot(max = 240, ms = 4000) {
    return new Promise((resolve) => {
      if (!box || !loaded) { resolve(null); return; }
      const prev = pendingShot;
      const mine = (url) => { prev?.(url); resolve(url); };
      mine.t0 = performance.now();
      pendingShot = mine;
      box.send({ type: 'screenshot', tag: 'thumb', max: Math.max(64, Math.round(max)) });
      setTimeout(() => { if (pendingShot === mine) { pendingShot = null; timing.shotTimeouts += 1; mine(null); } }, ms);
    });
  }
  const thumb = (max = 240) => smallShot(max, 4000);
  // (round 22) a crew stage is thrown away when its crew ends: its page and GPU go with it
  function dispose() { clearTimeout(idleTimer); if (box) box.frame.src = 'about:blank'; host?.remove(); host = null; box = null; loaded = null; }
  const self = { handle, timing, dataDirector: (sketchId) => director(sketchId, null, { quiet: true }), log: () => log.slice(), get running() { return loaded?.id || null; }, OK_TOOLS, thumb, dispose,
    director: (sketchId, route) => director(sketchId, route),
    // (round 35, labtemplates) a stage shown as a live preview (My templates' form lays its page over a box) and fed
    // what code doesn't carry (references, the palette)
    get host() { return host; }, send: (m) => box?.send(m) };
  return self;
}
const ThreeBackstage = makeBackstage();
ThreeBackstage.make = makeBackstage;
