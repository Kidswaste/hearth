// Comp (round 10): precomps in the Lab, like After Effects' layers made of layers. A precomp is a layer of a scene
// whose content is another scene (another chat's scene, a sketch, or a Lab sequence), running live inside this one:
// its own clock (start / speed / offset / loop or time-remap keys), the usual layer transform, opacity, blend and
// keyframes, plus crop, mask, a soft edge, effects (blur, brightness, saturation, hue…) and a resolution of its own.
// Filter layers above it work on it like on any layer. Precomps nest (a precomp of a scene that has precomps), a
// scene can't hold itself (the cycle shows as a card), and a precomp follows its source live: when another chat's
// director edits that scene backstage, the precomp here changes in place (only the layers that changed run again).
// The sequence and its frame-exact render play precomps too (tools/three-seq.js compiles them).
// Data: a precomp is an ordinary layer of sketch.layers with `precomp: { src: { chat | sketch | seq }, start, offset,
// speed, loop, len, crop: [t, r, b, l] %, mask: none | rounded | circle | ellipse, feather %, fx: { blur, bright,
// contrast, sat, hue, gray, invert, sepia }, res: 'auto' | 0.25..1 }` and a stub code line ("// ◫ precomp:<id>"),
// so every tool that reads a layer's code still works. Its keys: opacity / x / y / scale / rotate (the Lab's own),
// and remap, cropT/R/B/L, feather, blur, bright, contrast, sat, hue, gray, invert, sepia (sent with the precomp).
// The page side (tools/three-sandbox.html "precomps") runs it all in the one preview page: a precomp's box holds its
// scene's layer boxes, so its look is applied on the compositor; nothing is copied per frame and no extra frame opens.
// Entry points (progressive disclosure): right-click a layer → ◫ Precomp ›, right-click the preview → ◫ Comp ›,
// Alt+C in the Lab, /comp, /dispatch (comp-dispatch.js), the directors' three_do comp.
const ThreeComp = (() => {
  const AREA = 'Three.js Lab';
  const SLOT = 10000;
  const STUB_RE = /^\/\/ ◫ precomp:(\S+)/m;
  const ANIM = ['opacity', 'x', 'y', 'scale', 'rotate'];
  const PC_KEYS = ['remap', 'cropT', 'cropR', 'cropB', 'cropL', 'feather', 'blur', 'bright', 'contrast', 'sat', 'hue', 'gray', 'invert', 'sepia'];
  const FX = { blur: 0, bright: 1, contrast: 1, sat: 1, hue: 0, gray: 0, invert: 0, sepia: 0 };
  const MAX_DEPTH = 4;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const onFrame = (t, fps = 30) => Math.round(Math.max(0, Number(t) || 0) * fps) / fps;
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const CS = () => (typeof ChatScenes !== 'undefined' ? ChatScenes : null);
  let host = null; // the Lab's hooks (tools/three.js attach): send, sketchId, persist, select, player
  const sent = new Map(); // precomp layer id → the signature of what the preview runs (the scene on screen)
  const seqs = new Map(); // sequence key → { edit } (sequence sources), loaded on demand

  // ---------- what a precomp shows ----------
  const isStub = (code) => STUB_RE.test(String(code || ''));
  const isComp = (L) => Boolean(L?.precomp && isStub(L.code));
  function source(src) {
    if (!src) return { kind: 'none', label: 'nothing' };
    if (src.chat) {
      const c = (H.chats || []).find((x) => x.id === src.chat);
      return { kind: 'chat', chatId: src.chat, sketchId: CS()?.linkOf(src.chat) || null, label: c?.title || 'a chat (gone)', glyph: CS()?.identity(src.chat).glyph || '◆', color: CS()?.identity(src.chat).color };
    }
    if (src.seq) return { kind: 'seq', key: src.seq, label: `▤ ${String(src.seq).replace(/^seq:/, '')}` };
    return { kind: 'sketch', sketchId: src.sketch, label: S()?.get(src.sketch)?.name || 'a sketch (gone)' };
  }
  const describe = (L) => { const r = source(L.precomp?.src); return `${r.kind === 'chat' ? `the chat "${r.label}"` : r.kind === 'seq' ? `the sequence ${r.label}` : `the sketch "${r.label}"`}`; };
  // every sketch a sketch shows through its precomps (all the way down): a precomp can't hold a scene that holds it
  function holds(sketchId, seen = new Set()) {
    const sk = S()?.get(sketchId);
    if (!sk || seen.has(sketchId)) return seen;
    seen.add(sketchId);
    for (const L of S().layersOf(sk)) {
      if (!isComp(L)) continue;
      const r = source(L.precomp.src);
      if (r.sketchId) holds(r.sketchId, seen);
      if (r.kind === 'seq') for (const c of seqClips(r.key)) holds(c.clip.sketch, seen);
    }
    return seen;
  }
  const wouldLoop = (hostId, src) => { const r = source(src); const ids = r.kind === 'seq' ? seqClips(r.key).map((c) => c.clip.sketch) : [r.sketchId]; return ids.some((id) => id && (id === hostId || holds(id).has(hostId))); };

  // ---------- sequence sources (a Lab sequence as one layer) ----------
  function seqClips(key) {
    const e = seqs.get(key)?.edit;
    if (!e || typeof ThreeSeqData === 'undefined') return [];
    try { return ThreeSeqData.timing(e).filter((x) => x.clip.kind === 'scene' && !x.clip.off && x.clip.sketch); } catch { return []; }
  }
  async function loadSeq(key) {
    if (seqs.get(key)?.loading) return;
    seqs.set(key, { ...(seqs.get(key) || {}), loading: true });
    let e = null;
    try { e = await VideoCut.editFor(key); if (e) e = CutData.normalize(e); } catch { e = null; }
    seqs.set(key, { edit: e, loading: false, missing: !e });
    syncSoon();
  }

  // ---------- the spec the preview runs (tools/three-sandbox.html "precomps") ----------
  const runtime = (it, v) => (it.kind === 'color' && !it.quote && typeof v === 'string' ? parseInt(v.slice(1), 16) : v);
  const preps = new Map();
  // a layer of the source scene, its code instrumented at its own slider slot (its saved values), its keys as they
  // are (they live on its own scene's clock, which is the precomp's time)
  function prep(ly, slot) {
    const keys = Object.fromEntries(ANIM.filter((p) => ly.keys?.[p]?.length).map((p) => [p, ly.keys[p]]));
    const ck = `${slot}|${ly.code}`;
    let base = preps.get(ck);
    if (!base) {
      let sc = null;
      try { sc = ThreeTweaks.scan(ly.code || ''); } catch { sc = null; }
      if (!sc?.items?.length) base = { code: ly.code || '', values: undefined, items: [] };
      else {
        const b = slot * SLOT;
        try { base = { code: ThreeTweaks.instrument(sc.code, sc.items, b), values: Object.fromEntries(sc.items.map((it, i) => [b + i, runtime(it, it.orig)])), items: sc.items }; } catch { base = { code: ly.code || '', values: undefined, items: [] }; }
      }
      preps.set(ck, base);
      if (preps.size > 120) preps.delete(preps.keys().next().value);
    }
    const sliderKeys = {};
    for (const [p, ks] of Object.entries(ly.keys || {})) {
      if (!p.startsWith('s:') || !ks?.length) continue;
      const i = base.items.findIndex((it) => it.key === p.slice(2));
      if (i >= 0) sliderKeys[slot * SLOT + i] = { call: base.items[i].call, key: base.items[i].key, num: base.items[i].kind === 'color' && !base.items[i].quote, keys: ks };
    }
    return { code: base.code, values: base.values, keys, sliderKeys };
  }
  const card = (prefix, text) => [{ id: `${prefix}>card`, name: 'card', z: 0, card: { text }, opacity: 1, blend: 'normal', visible: true }];
  const lyBase = (ly, id, j) => ({ id, name: ly.name, z: j, opacity: ly.opacity ?? 1, blend: ly.blend || 'normal', x: ly.x || 0, y: ly.y || 0, scale: ly.scale ?? 1, rotate: ly.rotate || 0, in: ly.in ?? null, out: ly.out ?? null, fadeIn: ly.fadeIn || 0, fadeOut: ly.fadeOut || 0, visible: true, overrides: ly.overrides || null });
  function sceneSpecs(sk, prefix, path, alloc, depth) {
    return S().layersOf(sk).filter((ly) => ly.visible !== false).map((ly, j) => {
      const id = `${prefix}>${ly.id}`;
      if (isComp(ly)) return { ...lyBase(ly, id, j), code: '', keys: Object.fromEntries(ANIM.filter((p) => ly.keys?.[p]?.length).map((p) => [p, ly.keys[p]])), precomp: build(ly, id, path, alloc, depth + 1) };
      const slot = alloc.n++;
      const p = prep(ly, slot);
      return { ...lyBase(ly, id, j), slot, code: p.code, values: p.values, keys: p.keys, sliderKeys: p.sliderKeys };
    });
  }
  // L: a precomp layer → { label, children, start, speed, …, keys } (children: its source's layers, or a card)
  function build(L, prefix, path, alloc, depth) {
    const c = L.precomp || {};
    const r = source(c.src);
    let children; let len = Number(c.len) || 0; let fps = 30; let loop = c.loop !== false;
    if (depth >= MAX_DEPTH) children = card(prefix, `◫ ${r.label}\n(precomps nest ${MAX_DEPTH} deep at most)`);
    else if (r.kind === 'seq') {
      const got = seqs.get(r.key);
      if (!got || got.loading) { if (!got) loadSeq(r.key); children = card(prefix, `▤ Loading ${r.label}…`); } else if (!got.edit) children = card(prefix, `◫ Missing sequence\n${r.label}`);
      else {
        const clips = seqClips(r.key);
        if (clips.some((x) => path.includes(x.clip.sketch))) children = card(prefix, `↻ ${r.label} shows this scene:\na precomp can't hold itself`);
        else {
          // each scene clip: a precomp of its scene over the clip's time (the sequence's clock), a dissolve in
          children = clips.map((x, j) => {
            const id = `${prefix}>${x.clip.id}`;
            const ly = { id: x.clip.id, name: x.clip.name, precomp: { src: { sketch: x.clip.sketch }, start: r4(x.start - (x.clip.in || 0)), loop: false }, code: `// ◫ precomp:${x.clip.id}` };
            return { ...lyBase({ name: x.clip.name, in: r4(x.start), out: r4(x.end), fadeIn: r4(x.td || 0) }, id, j), code: '', keys: {}, precomp: build(ly, id, path, alloc, depth + 1) };
          });
          if (!len) len = r4(Math.max(0, ...clips.map((x) => x.end)));
          if (!children.length) children = card(prefix, `▤ ${r.label} has no scenes yet`);
        }
      }
    } else if (!r.sketchId || !S()?.get(r.sketchId)) children = card(prefix, r.kind === 'chat' ? `◫ ${r.label}\nhas no scene yet` : `◫ Missing scene\n${r.label}`);
    else if (path.includes(r.sketchId)) children = card(prefix, `↻ ${r.label} shows this scene:\na precomp can't hold itself`);
    else {
      const sk = S().get(r.sketchId);
      const tl = S().timelineOf?.(sk.id);
      if (!len && tl?.len && !S().songOf?.(sk.id)) len = tl.len;
      fps = tl?.fps || 30;
      children = sceneSpecs(sk, prefix, [...path, sk.id], alloc, depth);
    }
    if (!len) loop = false;
    const keys = Object.fromEntries(PC_KEYS.filter((k) => L.keys?.[k]?.length).map((k) => [k, L.keys[k]]));
    return { label: r.label, children, start: Number(c.start) || 0, offset: Number(c.offset) || 0, speed: c.speed ?? 1, loop, len, fps, crop: c.crop || null, mask: c.mask || 'none', feather: Number(c.feather) || 0, fx: { ...(c.fx || {}) }, res: c.res ?? 'auto', keys };
  }
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  // the precomp spec of a layer of hostId (slotBase: where its layers' sliders live in the page's table)
  function specOf(L, hostId, { slotBase = 2000 } = {}) {
    const pc = build(L, L.id, [hostId], { n: slotBase }, 0);
    pc.sig = hash(JSON.stringify(pc));
    return pc;
  }
  // tools/three.js run(): the spec of a precomp layer of the scene on screen (null: not a precomp)
  function specFor(L, hostId, index = 0) {
    if (!L?.precomp) return null;
    if (!isStub(L.code)) { delete L.precomp; return null; } // rewritten as code: a code layer now
    const pc = specOf(L, hostId, { slotBase: 2000 + index * 64 });
    sent.set(L.id, pc.sig);
    return pc;
  }

  // ---------- following the sources live ----------
  // A source scene changed (its director edited it backstage, you edited it, its sequence changed): the precomps on
  // screen that show it get the new version (pc-sync: only the layers that changed run again); in the Lab sequence
  // the plan is sent again (its clips with precomps run again).
  let syncTimer = 0;
  function syncSoon(ms = 120) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
  function syncNow() {
    const s = S();
    if (!s || !host) return 0;
    if (typeof ThreeSeq !== 'undefined' && ThreeSeq.owns()) { ThreeSeq.sketchChanged(); return 0; }
    const id = host.sketchId();
    const sk = id && s.get(id);
    if (!sk) return 0;
    let n = 0;
    s.layersOf(sk).forEach((L, i) => {
      if (!isComp(L) || !sent.has(L.id)) return;
      const pc = specOf(L, id, { slotBase: 2000 + i * 64 });
      if (sent.get(L.id) === pc.sig) return;
      sent.set(L.id, pc.sig);
      host.send({ type: 'pc-sync', id: L.id, precomp: pc });
      n += 1;
    });
    return n;
  }
  addEventListener('hearth:scene-changed', () => syncSoon());
  addEventListener('hearth:sketch', () => syncSoon(400));
  addEventListener('hearth:sequences', () => { for (const k of seqs.keys()) loadSeq(k); });
  if (typeof HubBridge !== 'undefined') HubBridge.onResult?.(() => syncSoon(250));

  // ---------- making and changing precomps ----------
  const layersOfId = (id) => { const sk = S()?.get(id); return sk ? S().layersOf(sk) : null; };
  function findPc(hostId, ref) {
    const Ls = (layersOfId(hostId) || []).filter(isComp);
    if (ref == null || ref === '' || ref === 'selected') { const sel = S().selectedOf?.(hostId); return Ls.find((L) => L.id === sel) || Ls.at(-1) || null; }
    if (ref === 'top') return Ls.at(-1) || null;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) { const all = layersOfId(hostId); const L = all[Number(ref) - 1]; return isComp(L) ? L : Ls[Number(ref) - 1] || null; }
    const r = String(ref).toLowerCase().replace(/^◫\s*/, '');
    return Ls.find((L) => L.id === ref) || Ls.find((L) => L.name.toLowerCase().replace(/^◫\s*/, '') === r) || Ls.find((L) => L.name.toLowerCase().includes(r)) || Ls.find((L) => source(L.precomp.src).label.toLowerCase().includes(r)) || null;
  }
  // "Rings", a chat's title, "seq:Name" / "▤ Name" → { chat | sketch | seq }
  function sourceFrom(ref, hostId = null) {
    if (ref && typeof ref === 'object') return ref.chat || ref.sketch || ref.seq ? ref : null;
    const q = String(ref || '').trim().replace(/^["“]|["”]$/g, '');
    if (!q) return null;
    const l = q.toLowerCase();
    if (/^(seq:|▤\s*)/i.test(q)) return { seq: `seq:${q.replace(/^(seq:|▤\s*)/i, '').trim()}` };
    const chats = (H.chats || []).filter((c) => H.agent(c.agentId)?.dock === 'three' && CS()?.linkOf(c.id) && CS().linkOf(c.id) !== hostId);
    const chat = chats.find((c) => c.id === q) || chats.find((c) => c.title.toLowerCase() === l) || chats.find((c) => c.title.toLowerCase().includes(l));
    if (chat) return { chat: chat.id };
    const sks = (S()?.all() || []).filter((x) => x.id !== hostId);
    const sk = sks.find((x) => x.id === q) || sks.find((x) => x.name.toLowerCase() === l) || sks.find((x) => x.name.toLowerCase().includes(l));
    if (sk) { const owner = CS()?.ownerOf(sk.id); return owner ? { chat: owner } : { sketch: sk.id }; }
    return null;
  }
  const stub = (id, r) => `// ◫ precomp:${id}\n// This layer is another scene: ${r.kind === 'chat' ? `the chat "${r.label}"'s scene` : r.kind === 'seq' ? `the sequence ${r.label}` : `the sketch "${r.label}"`}, live (its own clock and layers).\n// Change it with right-click › ◫ Precomp, /comp or three_do comp (time, size, crop, mask, effects), not here.\n`;
  // where a part sits: the whole frame, a corner, a half, a quarter, a circle, or one of n columns / rows
  const LAYOUTS = {
    full: { label: 'Full frame', set: {} },
    pip: { label: 'Picture in picture', set: { x: 27, y: -30, scale: 0.38, mask: 'rounded' } },
    left: { label: 'Left half', set: { x: -25, crop: [0, 25, 0, 25] } },
    right: { label: 'Right half', set: { x: 25, crop: [0, 25, 0, 25] } },
    top: { label: 'Top half', set: { y: -25, crop: [25, 0, 25, 0] } },
    bottom: { label: 'Bottom half', set: { y: 25, crop: [25, 0, 25, 0] } },
    q1: { label: 'Top-left quarter', set: { x: -25, y: -25, scale: 0.5 } },
    q2: { label: 'Top-right quarter', set: { x: 25, y: -25, scale: 0.5 } },
    q3: { label: 'Bottom-left quarter', set: { x: -25, y: 25, scale: 0.5 } },
    q4: { label: 'Bottom-right quarter', set: { x: 25, y: 25, scale: 0.5 } },
    circle: { label: 'Circle', set: { scale: 0.62, mask: 'circle', feather: 6 } },
  };
  // part i of n side by side: columns in a wide frame, rows in a tall one (each shows the middle of its scene)
  function splitOf(i, n, tall) {
    const k = 100 / n; const cut = (100 - k) / 2; const at = -50 + (i + 0.5) * k;
    return tall ? { y: r4(at), crop: [r4(cut), 0, r4(cut), 0] } : { x: r4(at), crop: [0, r4(cut), 0, r4(cut)] };
  }
  const SETTABLE = ['start', 'offset', 'speed', 'loop', 'len', 'crop', 'mask', 'feather', 'res'];
  const LAYER_PROPS = ['name', 'visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
  function applyPatch(L, patch) {
    const c = L.precomp;
    for (const [k, v0] of Object.entries(patch || {})) {
      let v = v0;
      if (k === 'layout') { if (LAYOUTS[v]) applyPatch(L, { x: 0, y: 0, scale: 1, crop: null, mask: 'none', feather: 0, ...LAYOUTS[v].set }); continue; }
      if (k === 'source' || k === 'src') { const src = sourceFrom(v); if (src) { c.src = src; L.name = `◫ ${source(src).label}`; L.code = stub(L.id, source(src)); } continue; }
      if (k === 'fx' && v && typeof v === 'object') { c.fx = { ...(c.fx || {}) }; for (const [f, x] of Object.entries(v)) { if (!(f in FX)) continue; if (x == null || Number(x) === FX[f]) delete c.fx[f]; else c.fx[f] = Number(x); } continue; }
      if (k in FX) { applyPatch(L, { fx: { [k]: v } }); continue; }
      if (SETTABLE.includes(k)) {
        if (k === 'crop') v = v == null ? null : (Array.isArray(v) ? v : String(v).split(/[ ,]+/)).slice(0, 4).map((x) => Math.max(0, Math.min(49, Number(x) || 0)));
        else if (k === 'loop') v = !(v === false || /^(off|no|false|0)$/i.test(String(v)));
        else if (k === 'mask') v = ['none', 'rounded', 'circle', 'ellipse'].includes(String(v)) ? String(v) : 'none';
        else if (k === 'res') v = v === 'auto' || v == null ? 'auto' : Math.max(0.25, Math.min(1, Number(v) || 1));
        else if (k === 'start' || k === 'offset') v = onFrame(v);
        else v = Number(v);
        c[k] = v;
        continue;
      }
      if (LAYER_PROPS.includes(k)) {
        if (k === 'visible') L.visible = !(v === false || /^(off|no|false|0|hide)$/i.test(String(v)));
        else if (k === 'name' || k === 'blend') L[k] = String(v);
        else if (k === 'in' || k === 'out') L[k] = v == null || v === 'null' ? null : onFrame(v);
        else L[k] = Number(v);
      }
    }
    return L;
  }
  // a precomp layer object (not yet in a sketch)
  function makeLayer(src, opts = {}) {
    const r = source(src);
    const id = `pc${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
    const L = { ...ThreeLayers.defaults({ id, name: opts.name ? `◫ ${String(opts.name).replace(/^◫\s*/, '')}` : `◫ ${r.label}` }), code: stub(id, r), color: r.color || '#bd8bff', precomp: { src, start: 0, offset: 0, speed: 1, loop: true, crop: null, mask: 'none', feather: 0, fx: {}, res: 'auto' } };
    applyPatch(L, opts.set || {});
    return L;
  }
  // a change to a scene's layers: saved; on screen, the Lab shows it in place (then the precomps get theirs)
  function commit(hostId, { select = null } = {}) {
    if (host && host.sketchId() === hostId) host.persist?.();
    S().changed(hostId);
    if (select && host && host.sketchId() === hostId) host.select?.(select);
    syncSoon(60);
  }
  const hostOf = (ctx = {}) => ctx.sketchId || S()?.currentId() || null;
  // add a precomp of `ref` to hostId: { layout, position, set } → the layer
  function add(hostId, ref, { layout = 'full', set = {}, name = null, position = 'top' } = {}) {
    const s = S();
    if (!s?.get(hostId)) throw new Error('No scene to add it to.');
    const src = sourceFrom(ref, hostId);
    if (!src) throw new Error(`No chat, sketch or sequence called "${typeof ref === 'string' ? ref : JSON.stringify(ref)}".`);
    if (wouldLoop(hostId, src)) throw new Error(`"${source(src).label}" shows this scene already: a precomp can't hold itself.`);
    const Ls = s.layersOf(s.get(hostId));
    const L = makeLayer(src, { name, set: { ...(LAYOUTS[layout]?.set || {}), ...set } });
    L.slot = Math.max(-1, ...Ls.map((x) => x.slot ?? 0)) + 1;
    if (position === 'bottom') Ls.unshift(L); else if (typeof position === 'number') Ls.splice(Math.max(0, Math.min(Ls.length, position - 1)), 0, L); else Ls.push(L);
    commit(hostId, { select: L.id });
    return L;
  }
  function set(hostId, ref, patch) {
    const L = findPc(hostId, ref);
    if (!L) throw new Error('No precomp layer in this scene (add one: /comp add <chat or scene>).');
    if (patch.source || patch.src) { const src = sourceFrom(patch.source || patch.src, hostId); if (!src) throw new Error('No such source.'); if (wouldLoop(hostId, src)) throw new Error('That scene shows this one already: a precomp can\'t hold itself.'); }
    applyPatch(L, patch);
    commit(hostId);
    return L;
  }
  // keys: [{ t | time, v | value, ease }] on remap / crop* / feather / effects / the transform; [] or null clears
  function key(hostId, ref, prop, keys) {
    const L = findPc(hostId, ref);
    if (!L) throw new Error('No precomp layer in this scene.');
    const p = String(prop || '');
    if (![...PC_KEYS, ...ANIM].includes(p)) throw new Error(`Keyframe what? ${[...ANIM, ...PC_KEYS].join(', ')}`);
    const list = (keys || []).map((k) => ({ t: onFrame(k.t ?? k.time), v: Number(k.v ?? k.value), ease: k.ease || 'ease' })).filter((k) => Number.isFinite(k.v)).sort((a, b) => a.t - b.t);
    L.keys ||= {};
    if (list.length) L.keys[p] = list; else delete L.keys[p];
    commit(hostId);
    return { layer: L.name, property: p, keys: list.length };
  }
  function remove(hostId, ref) {
    const L = findPc(hostId, ref);
    if (!L) throw new Error('No precomp layer in this scene.');
    const Ls = layersOfId(hostId);
    if (Ls.length <= 1) throw new Error('A scene keeps at least one layer.');
    Ls.splice(Ls.indexOf(L), 1);
    sent.delete(L.id);
    commit(hostId);
    return L.name;
  }
  // jump into what a precomp shows: its chat (the Lab follows to its scene), its sketch, or its sequence
  async function open(hostId, ref) {
    const L = findPc(hostId, ref);
    if (!L) throw new Error('No precomp layer in this scene.');
    const r = source(L.precomp.src);
    if (r.kind === 'chat') { const c = (H.chats || []).find((x) => x.id === r.chatId); if (!c) throw new Error('That chat is gone.'); Native.open(c.agentId, c.id); Tools.openDock?.('three'); return `Opened the chat "${r.label}"`; }
    if (r.kind === 'seq') { await ThreeSeq.open?.(r.key.slice(4)); return `Opened ${r.label}`; }
    if (!S().get(r.sketchId)) throw new Error('That sketch is gone.');
    S().open(r.sketchId);
    return `Opened "${r.label}"`;
  }
  function list(hostId) {
    return (layersOfId(hostId) || []).map((L, i) => ({ L, i })).filter(({ L }) => isComp(L)).map(({ L, i }) => {
      const c = L.precomp; const r = source(c.src);
      const fx = Object.entries(c.fx || {}).map(([k, v]) => `${k} ${v}`).join(', ');
      return { n: i + 1, layer: L.name, shows: describe(L), ...(r.kind === 'chat' ? { working: Native.isBusy(r.chatId) } : {}), time: `${c.start ? `starts ${c.start} s · ` : ''}${c.speed !== 1 ? `${c.speed}× · ` : ''}${c.offset ? `from its ${c.offset} s · ` : ''}${c.loop === false ? 'holds its last frame' : 'loops'}${L.keys?.remap?.length ? ' · time remapped' : ''}`,
        ...(L.in != null || L.out != null ? { plays: `${L.in ?? 0}–${L.out ?? 'end'} s` } : {}),
        place: `x ${L.x || 0} · y ${L.y || 0} · scale ${L.scale ?? 1}${L.rotate ? ` · ${L.rotate}°` : ''} · opacity ${L.opacity ?? 1}${L.blend && L.blend !== 'normal' ? ` · ${L.blend}` : ''}`,
        ...(c.crop || c.mask !== 'none' || c.feather ? { cut: `${c.crop ? `crop ${c.crop.join(' ')} · ` : ''}${c.mask}${c.feather ? ` · soft ${c.feather}%` : ''}` } : {}),
        ...(fx ? { effects: fx } : {}), res: c.res, ...(Object.keys(L.keys || {}).length ? { keys: Object.keys(L.keys).join(', ') } : {}) };
    });
  }

  // ---------- menus (right-click a layer → ◫ Precomp ›, the preview → ◫ Comp ›, Alt+C) ----------
  const dirChats = (hostId) => (H.chats || []).filter((c) => H.agent(c.agentId)?.dock === 'three' && CS()?.linkOf(c.id) && CS().linkOf(c.id) !== hostId).slice(0, 24);
  const tryDo = (fn) => async () => { try { const r = await fn(); if (typeof r === 'string') toast(r, { timeout: 2200 }); } catch (err) { toast(err.message, { type: 'error' }); } };
  // the "add" submenus, as popMenu arrays: [label, hint, fn | items]
  function addItems(hostId, layout = 'full') {
    const chats = dirChats(hostId).map((c) => [`${CS()?.identity(c.id).glyph || '◆'} ${cap(c.title, 34)}`, Native.isBusy(c.id) ? 'working' : '', tryDo(() => { add(hostId, { chat: c.id }, { layout }); return `◫ ${c.title} is a layer here`; })]);
    const sks = (S()?.all() || []).filter((x) => x.id !== hostId && !CS()?.ownerOf(x.id)).slice(-20).reverse().map((x) => [cap(x.name, 36), '', tryDo(() => { add(hostId, { sketch: x.id }, { layout }); return `◫ ${x.name} is a layer here`; })]);
    return [
      ['A chat\'s scene', `${chats.length}`, chats.length ? chats : [['No other director chats yet', '/dispatch makes some', () => {}]]],
      ['A sketch', `${sks.length}`, sks.length ? sks : [['No other sketches', '', () => {}]]],
      ['A sequence…', 'by name', tryDo(async () => { const v = await Modal.prompt('Which Lab sequence?', { placeholder: 'its name' }); if (!v) return null; add(hostId, `seq:${v.trim()}`, { layout }); return `◫ ▤ ${v} is a layer here`; })],
    ];
  }
  function compItems(hostId = S()?.currentId()) {
    if (!hostId) return [['Open the Lab first', '', () => {}]];
    const pcs = (layersOfId(hostId) || []).filter(isComp);
    const D = typeof CompDispatch !== 'undefined' ? CompDispatch : null;
    return ['◫ Comp',
      ['＋ Another scene as a layer', 'a precomp', addItems(hostId)],
      ['＋ As picture in picture', '', addItems(hostId, 'pip')],
      D ? ['⇉ Dispatch parts to other chats…', 'each builds its part at once', () => D.ask().catch((err) => toast(err.message, { type: 'error' }))] : null,
      D?.latestFor(hostId) ? ['Parts', D.summaryLine(hostId), () => D.reveal(hostId)] : null,
      ...(pcs.length ? ['Precomps here', ...pcs.map((L) => [L.name, cap(describe(L), 30), pcItems(hostId, L)])] : []),
      ['⇪ Render this comp 9:16', 'frame by frame', tryDo(() => renderComp(hostId, '9:16').then((r) => `Rendered ${String(r.path || '').split(/[\\/]/).pop()}`))],
    ].filter(Boolean);
  }
  const pick = (cur, v) => (typeof cur === 'number' ? Math.abs(cur - v) < 1e-6 : cur === v);
  function pcItems(hostId, L) {
    const c = L.precomp; const id = L.id;
    const S1 = (patch) => tryDo(() => { set(hostId, id, patch); return null; });
    const fx = c.fx || {};
    const now = () => host?.player?.time ?? 0;
    return [
      ['↗ Open its scene', describe(L), tryDo(() => open(hostId, id))],
      ['Time', `${c.speed}× · ${c.loop === false ? 'hold' : 'loop'}`, [
        ['Starts at the playhead', `${onFrame(now()).toFixed(2)} s`, S1({ start: now() })],
        ['Starts at 0', '', S1({ start: 0 }), pick(c.start || 0, 0)],
        ...[0.25, 0.5, 1, 2, -1].map((v) => [v === -1 ? 'Reversed' : `${v}× speed`, '', S1({ speed: v }), pick(c.speed ?? 1, v)]),
        ['Loop it', 'over its own length', S1({ loop: true }), c.loop !== false],
        ['Hold its last frame', '', S1({ loop: false }), c.loop === false],
        ['Freeze here (time remap)', 'one key', tryDo(() => { const h = onFrame(now()); key(hostId, id, 'remap', [{ t: h, v: Math.max(0, (h - (c.start || 0)) * (c.speed ?? 1) + (c.offset || 0)), ease: 'hold' }]); return '◫ Frozen on this frame'; })],
        L.keys?.remap?.length ? ['Clear the time remap', '', tryDo(() => { key(hostId, id, 'remap', []); return null; })] : null,
      ].filter(Boolean)],
      ['Size & place', '', [...Object.entries(LAYOUTS).map(([k, v]) => [v.label, '', S1({ layout: k })]), ['Fade in / out ½ s', '', S1({ fadeIn: 0.5, fadeOut: 0.5 })]]],
      ['Crop & mask', c.mask !== 'none' ? c.mask : c.crop ? 'cropped' : '', [
        ...['none', 'rounded', 'circle', 'ellipse'].map((m) => [m === 'none' ? 'No mask' : `${m[0].toUpperCase()}${m.slice(1)}`, '', S1({ mask: m }), (c.mask || 'none') === m]),
        ...[0, 5, 15, 30].map((f) => [f ? `Soft edge ${f} %` : 'Hard edge', '', S1({ feather: f }), pick(c.feather || 0, f)]),
        ['Crop…', 'top right bottom left (%)', tryDo(async () => { const v = await Modal.prompt('Crop (top right bottom left, %)', { value: (c.crop || [0, 0, 0, 0]).join(' ') }); if (v != null) set(hostId, id, { crop: v }); return null; })],
        ['No crop', '', S1({ crop: null }), !c.crop],
      ]],
      ['Effects', Object.keys(fx).length ? Object.keys(fx).join(', ') : '', [
        ['Blur', '', [0, 0.3, 1, 3].map((v) => [v ? `${v} %` : 'None', '', S1({ blur: v }), pick(fx.blur || 0, v)])],
        ['Brightness', '', [0.6, 0.85, 1, 1.25, 1.6].map((v) => [`${Math.round(v * 100)} %`, '', S1({ bright: v }), pick(fx.bright ?? 1, v)])],
        ['Saturation', '', [0, 0.5, 1, 1.5, 2].map((v) => [`${Math.round(v * 100)} %`, '', S1({ sat: v }), pick(fx.sat ?? 1, v)])],
        ['Hue', '', [0, 60, 120, 180, 270].map((v) => [`${v}°`, '', S1({ hue: v }), pick(fx.hue || 0, v)])],
        ['Black & white', '', S1({ gray: fx.gray ? 0 : 1 }), Boolean(fx.gray)],
        ['Invert', '', S1({ invert: fx.invert ? 0 : 1 }), Boolean(fx.invert)],
        ['No effects', '', tryDo(() => { L.precomp.fx = {}; commit(hostId); return null; })],
      ]],
      ['Resolution', c.res === 'auto' ? 'auto' : `${Math.round(c.res * 100)} %`, [['Automatic', 'follows its size and cost', S1({ res: 'auto' }), c.res === 'auto'], ...[1, 0.75, 0.5, 0.33].map((v) => [`${Math.round(v * 100)} %`, '', S1({ res: v }), c.res === v])]],
      ['Show another scene', '', addItems(hostId).map(([label, hint, items]) => [label, hint, Array.isArray(items) ? items.map(([l, h, fn]) => [l, h, fn]) : items])],
    ];
  }
  // the layer row's right-click (tools/three.js adds these to its menu)
  function layerMenu(L, hostId = S()?.currentId()) {
    if (!hostId) return [];
    if (isComp(L)) return [['◫ Precomp', cap(describe(L), 30), pcItems(hostId, L)]];
    return [['◫ Comp', 'another scene as a layer', addItems(hostId)]];
  }
  // the preview's right-click (object-form menu items)
  function previewItem() {
    const toObj = (it) => (typeof it === 'string' ? it : { label: it[0], hint: it[1] || '', ...(Array.isArray(it[2]) ? { items: () => it[2].map(toObj) } : { action: it[2] }), checked: Boolean(it[3]) });
    return { label: '◫ Comp', hint: 'Alt+C', items: () => compItems().slice(1).map(toObj) };
  }
  function menuAtCenter() {
    const host0 = S()?.previewHost?.();
    const r = host0?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 - 150 : innerWidth / 2 - 150; const y = r ? r.top + 60 : 120;
    ThreeTweaks.menu(x, y, compItems());
  }
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.code !== 'KeyC') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.target.closest?.('.tool-dock, dialog')) return;
    if (!document.querySelector('.layers')?.offsetParent) return;
    e.preventDefault();
    try { menuAtCenter(); } catch (err) { toast(err.message, { type: 'error' }); }
    (typeof Usage !== 'undefined') && Usage.key?.('Alt+C', 'Lab');
  });
  addEventListener('DOMContentLoaded', () => {
    try {
      Keys.add(
        { area: 'Lab', keys: 'Alt+C', what: '◫ Comp: another scene (another chat\'s) as a layer, dispatch parts to other chats, render the comp (/comp)', when: () => Boolean(document.querySelector('.layers')?.offsetParent), run: () => menuAtCenter() },
        { area: 'Lab', keys: 'Right-click a layer', what: '◫ Precomp ›: its time, size, crop & mask, effects, resolution, open its scene', when: () => Boolean(document.querySelector('.layers')?.offsetParent) },
      );
    } catch { /* keys list optional */ }
  });

  // ---------- the Nodes view: a precomp is one node ----------
  const LABEL = { start: 'Starts at (s)', speed: 'Speed', offset: 'From its (s)', loop: 'Loop', opacity: 'Opacity', scale: 'Scale', x: 'X %', y: 'Y %', rotate: 'Rotate °', blur: 'Blur %', sat: 'Saturation', hue: 'Hue °' };
  function defineNode() {
    if (typeof ThreeNodes === 'undefined' || !ThreeNodes.registry || ThreeNodes.registry.get('precomp')) return;
    const num = (name, value, min, max, step = 0.01) => ({ name, type: 'num', value, min, max, step, label: LABEL[name], slider: false });
    ThreeNodes.registry.define({
      type: 'precomp', title: '◫ Precomp', category: 'Scene', color: '#bd8bff', hidden: true,
      desc: 'Another scene as this layer (a precomp): its knobs are the precomp\'s time, place and look',
      widgets: [num('start', 0, -60, 600), num('speed', 1, -4, 4), num('offset', 0, 0, 600), { name: 'loop', type: 'bool', value: true, label: 'Loop', slider: false },
        num('opacity', 1, 0, 1), num('scale', 1, 0.05, 4), num('x', 0, -100, 100, 0.5), num('y', 0, -100, 100, 0.5), num('rotate', 0, -360, 360, 1),
        num('blur', 0, 0, 10, 0.1), num('sat', 1, 0, 3), num('hue', 0, 0, 360, 1),
        { name: 'blend', kind: 'select', options: ThreeLayers.BLENDS.map(([v]) => v), value: 'normal', slider: false, label: 'Blend' },
        { name: 'mask', kind: 'select', options: ['none', 'rounded', 'circle', 'ellipse'], value: 'none', slider: false, label: 'Mask' }],
      outputs: [{ name: 'obj', type: 'obj', label: 'Scene' }],
      compile: () => ({ obj: 'null' }),
    });
  }
  // tools/three-nodes.js asks: is this layer a precomp? → { graph, note, buttons }
  function nodeGraph(code) {
    const m = STUB_RE.exec(String(code || ''));
    const hostId = S()?.currentId();
    const L = m && hostId ? (layersOfId(hostId) || []).find((x) => x.id === m[1] && isComp(x)) : null;
    if (!L) return null;
    defineNode();
    const c = L.precomp; const fx = c.fx || {};
    const values = { start: c.start || 0, speed: c.speed ?? 1, offset: c.offset || 0, loop: c.loop !== false, opacity: L.opacity ?? 1, scale: L.scale ?? 1, x: L.x || 0, y: L.y || 0, rotate: L.rotate || 0, blur: fx.blur || 0, sat: fx.sat ?? 1, hue: fx.hue || 0, blend: L.blend || 'normal', mask: c.mask || 'none' };
    return {
      layerId: L.id,
      graph: { v: 1, kind: 'three', nodes: [{ id: 'pc', type: 'precomp', x: 120, y: 90, title: L.name, values }], links: [], frames: [], notes: [] },
      note: `◫ ${describe(L)}, live: one node; its knobs are the precomp's (the scene itself is edited in its own chat).`,
      buttons: [['↗ Open its scene', 'Jump into that scene', () => tryDo(() => open(hostId, L.id))(), 'primary small']],
      status: `◫ precomp · ${list(hostId).find((x) => x.layer === L.name)?.time || ''}`,
    };
  }
  const nodeApply = debounce((layerId, values) => {
    const hostId = S()?.currentId();
    if (!hostId) return;
    try { set(hostId, layerId, { start: values.start, speed: values.speed, offset: values.offset, loop: values.loop, opacity: values.opacity, scale: values.scale, x: values.x, y: values.y, rotate: values.rotate, blur: values.blur, sat: values.sat, hue: values.hue, blend: values.blend, mask: values.mask }); } catch (err) { toast(err.message, { type: 'error' }); }
  }, 180);
  function fromNode(graph, layerId) {
    const n = graph?.nodes?.find((x) => x.type === 'precomp');
    if (n && layerId) nodeApply(layerId, n.values || {});
  }

  // ---------- render the comp (the scene, frame by frame, through the Lab sequence's offline render) ----------
  async function renderComp(hostId = S()?.currentId(), format = '9:16', secs = null) {
    if (typeof ThreeSeq === 'undefined') throw new Error('The Lab sequence isn\'t loaded.');
    const tl = S().timelineOf?.(hostId);
    const len = secs || (S().songOf?.(hostId) && host?.player?.loaded ? Math.min(60, host.player.duration) : tl?.len || 10);
    return ThreeSeq.renderScene(hostId, { secs: len, format, name: `${S().get(hostId)?.name || 'Comp'} comp` });
  }

  // ---------- the directors: three_do comp { op } ----------
  const HELP = `three_do comp {op}: precomps = other scenes as layers of this scene (live, each on its own clock).
add {source: chat title | sketch name | "seq:<name>", layout: full|pip|left|right|top|bottom|q1-q4|circle, set} · list
set {layer, start, speed, offset, loop, crop: [t,r,b,l] %, mask: none|rounded|circle|ellipse, feather %, blur, bright, contrast, sat, hue, gray, invert, res: auto|0.25-1, x, y, scale, rotate, opacity, blend, in, out, fadeIn, fadeOut, source}
key {layer, property: remap|cropT|cropR|cropB|cropL|feather|blur|bright|sat|hue|x|y|scale|rotate|opacity, keys: [{time, value, ease}]} (remap: scene s → its s; [] clears) · remove {layer} · render {format}
Parts made by other chats at once: dispatch {parts: [{brief, engine: claude|astra, name}], layout: time|split|stack} · parts (their status and last words) · feedback {part, text} · again {part, fresh} · swap {part}`;
  async function handle(args = {}, ctx = {}) {
    const op = String(args.op || 'list');
    try {
      if (op === 'help') return { ok: true, value: HELP };
      if (['dispatch', 'parts', 'feedback', 'again', 'swap', 'redispatch'].includes(op)) {
        if (typeof CompDispatch === 'undefined') return { ok: false, error: 'Dispatching isn\'t available.' };
        return await CompDispatch.handle(op, args, ctx);
      }
      for (let i = 0; i < 50 && !S(); i += 1) await new Promise((r) => setTimeout(r, 100));
      const hostId = hostOf(ctx);
      if (!hostId) return { ok: false, error: 'No scene.' };
      const layer = args.layer ?? args.precomp ?? null;
      if (op === 'list') { const l = list(hostId); return { ok: true, value: l.length ? { scene: S().get(hostId).name, precomps: l } : 'No precomps in this scene (op add {source} makes one).' }; }
      if (op === 'add') { const L = add(hostId, args.source ?? args.src ?? args.scene ?? args.chat, { layout: args.layout || 'full', set: args.set || {}, name: args.name || null, position: args.position || 'top' }); return { ok: true, value: { added: L.name, shows: describe(L), layers: layersOfId(hostId).map((x) => x.name) } }; }
      if (op === 'set') { const patch = { ...(args.set || {}), ...Object.fromEntries(Object.entries(args).filter(([k]) => !['op', 'layer', 'precomp', 'set'].includes(k))) }; const L = set(hostId, layer, patch); return { ok: true, value: list(hostId).find((x) => x.layer === L.name) }; }
      if (op === 'key' || op === 'keyframes') return { ok: true, value: key(hostId, layer, args.property, args.clear ? [] : args.keys) };
      if (op === 'remove') return { ok: true, value: `Removed ${remove(hostId, layer)}` };
      if (op === 'open') return { ok: true, value: await open(hostId, layer) };
      if (op === 'render') { const r = await renderComp(hostId, args.format || '9:16', args.secs || null); return { ok: true, value: { rendered: r.path, frames: r.frames, format: r.format } }; }
      return { ok: false, error: `Unknown op "${op}" (op: "help")` };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // ---------- chat: /comp ----------
  const SUBS = [['add', 'add <chat | sketch | seq:name> [pip|left|right|top|bottom|q1…q4|circle]'], ['list', 'The precomps in this scene'], ['set', 'set <layer> start=2 speed=0.5 loop=off crop=10,0,10,0 mask=circle feather=10 blur=1 sat=0 res=0.5 scale=.5 x=20'],
    ['key', 'key <layer> <remap|blur|scale|cropT…> 0:1 2:0.5 (time:value)'], ['open', 'open <layer>: jump into its scene / chat'], ['remove', 'remove <layer>'], ['render', 'render [9:16|16:9|1:1|4:5]: this comp, frame by frame'],
    ['parts', 'The dispatched parts: chat, agent, status'], ['feedback', 'feedback <part n> <words>'], ['again', 'again <part n> [fresh]'], ['swap', 'swap <part n>: Claude ⇄ Astra']];
  function parseKV(s) {
    const out = {}; let rest = String(s || '');
    // source= takes the rest of the line (chat titles have spaces)
    const src = /\bsource=(.+)$/.exec(rest);
    if (src) { out.source = src[1].trim().replace(/^"|"$/g, ''); rest = rest.slice(0, src.index); }
    rest = rest.replace(/(\w+)=("[^"]*"|\S+)/g, (_, k, v) => { out[k] = v.replace(/^"|"$/g, ''); return ''; });
    return { kv: out, rest: rest.trim() };
  }
  function register() {
    if (Commands.get('comp')) return;
    Commands.register({
      name: 'comp', aliases: Commands.get('precomp') ? [] : ['precomp'], area: AREA, args: '[add|list|set|key|open|remove|render|parts|feedback|again|swap]',
      desc: 'Comp: other scenes (other chats\') as layers of this scene, live (no args: what\'s in it; Alt+C for the menu)',
      keywords: 'precomp composite compositing after effects layer of layers nest scene in scene picture in picture split screen parts dispatch',
      examples: ['/comp', '/comp add Rings pip', '/comp set 2 start=4 speed=0.5', '/comp key 2 remap 0:0 4:8', '/comp render 9:16'],
      complete: (a) => {
        const w = String(a || '').trim().split(/\s+/);
        if (w.length <= 1 && !/\s$/.test(a || '')) return SUBS.filter(([v]) => v.startsWith(w[0] || '')).map(([value, hint]) => ({ value, hint }));
        if (w[0] === 'add') { const id = S()?.currentId(); return [...dirChats(id).map((c) => ({ value: `add ${c.title}`, hint: 'a chat\'s scene' })), ...(S()?.all() || []).filter((x) => x.id !== id).slice(-10).map((x) => ({ value: `add ${x.name}`, hint: 'a sketch' }))].filter((x) => x.value.toLowerCase().includes(String(a).toLowerCase().slice(4))).slice(0, 14); }
        if (['set', 'key', 'open', 'remove'].includes(w[0])) return (layersOfId(S()?.currentId()) || []).filter(isComp).map((L, i) => ({ value: `${w[0]} ${i + 1}`, hint: L.name }));
        return [];
      },
      run: async (args, ctx) => {
        await ThreeLab.cmd({ show: false });
        for (let i = 0; i < 50 && !S(); i += 1) await new Promise((r) => setTimeout(r, 100));
        const hostId = S()?.currentId();
        const [sub0, ...restW] = String(args || '').trim().split(/\s+/);
        const sub = (sub0 || '').toLowerCase();
        const rest = restW.join(' ');
        if (['parts', 'feedback', 'again', 'swap'].includes(sub)) return typeof CompDispatch !== 'undefined' ? CompDispatch.command(sub, rest, ctx) : 'Dispatching isn\'t available.';
        if (!hostId) return 'Open the Three.js Lab first.';
        const say = (r) => (r.ok === false ? `Error: ${r.error}` : r.value);
        const pcNum = (w) => { const all = layersOfId(hostId); const pcs = all.filter(isComp); return /^\d+$/.test(w || '') ? (pcs[Number(w) - 1] || null)?.id ?? w : w; };
        if (!sub || sub === 'list') {
          const l = list(hostId);
          return l.length ? `◫ **${S().get(hostId).name}**: ${l.length} precomp${l.length === 1 ? '' : 's'}\n${l.map((x, i) => `${i + 1}. ${x.layer} · ${x.shows} · ${x.time}${x.plays ? ` · plays ${x.plays}` : ''}${x.cut ? ` · ${x.cut}` : ''}${x.effects ? ` · ${x.effects}` : ''}`).join('\n')}` : 'No precomps in this scene: /comp add <chat or sketch>, or Alt+C.';
        }
        if (sub === 'add') {
          const lay = Object.keys(LAYOUTS).find((k) => new RegExp(`\\s${k}$`, 'i').test(` ${rest}`)) || 'full';
          const ref = rest.replace(new RegExp(`\\s*\\b${lay}$`, 'i'), '').trim();
          if (!ref) { menuAtCenter(); return null; }
          return say(await handle({ op: 'add', source: ref, layout: lay }, { sketchId: hostId }));
        }
        if (sub === 'set') { const [ref, ...more] = rest.split(/\s+/); const { kv } = parseKV(more.join(' ')); const r = await handle({ op: 'set', layer: pcNum(ref), ...kv }, { sketchId: hostId }); return r.ok ? `◫ ${r.value?.layer}: ${r.value?.time} · ${r.value?.place}${r.value?.cut ? ` · ${r.value.cut}` : ''}${r.value?.effects ? ` · ${r.value.effects}` : ''}` : `Error: ${r.error}`; }
        if (sub === 'key') {
          const [ref, prop, ...pairs] = rest.split(/\s+/);
          const keys = pairs.map((p) => { const [t, v, e] = p.split(':'); return { time: Number(t), value: Number(v), ease: e || 'ease' }; }).filter((k) => Number.isFinite(k.time));
          const r = await handle({ op: 'key', layer: pcNum(ref), property: prop, keys }, { sketchId: hostId });
          return r.ok ? `◫ ${r.value.layer}: ${r.value.keys} key${r.value.keys === 1 ? '' : 's'} on ${r.value.property}` : `Error: ${r.error}`;
        }
        if (sub === 'open' || sub === 'remove') return say(await handle({ op: sub, layer: pcNum(rest) }, { sketchId: hostId }));
        if (sub === 'render') { const r = await handle({ op: 'render', format: rest || '9:16' }, { sketchId: hostId }); return r.ok ? `⇪ Rendered ${String(r.value.rendered).split(/[\\/]/).pop()} (${r.value.frames} frames, ${r.value.format})` : `Error: ${r.error}`; }
        return `Use ${SUBS.map(([v]) => v).join(', ')} (/help comp).`;
      },
    });
  }
  if (typeof Commands !== 'undefined') { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register(); }
  addEventListener('DOMContentLoaded', () => {
    AppUI.addAction?.('Lab: Comp (another chat\'s scene as a layer, Alt+C)', async () => { await ThreeLab.cmd({ show: true }); menuAtCenter(); });
    defineNode();
  });

  return {
    // tools/three.js
    attach(h) { host = h; }, specFor, layerMenu, previewItem, isComp, isStub, describe,
    // tools/three-seq.js, tools/three-backstage.js
    specOf: (L, hostId, opts) => (L?.precomp && isStub(L.code) ? specOf(L, hostId, opts) : null),
    // tools/three-nodes.js
    nodeGraph, fromNode,
    // comp-dispatch.js and the commands
    add, set, key, remove, open, list, findPc, sourceFrom, source, makeLayer, splitOf, LAYOUTS, renderComp, holds, wouldLoop, menu: menuAtCenter, compItems,
    handle, syncNow, HELP,
  };
})();
