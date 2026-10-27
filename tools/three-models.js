// 3D models as first-class citizens of the Three.js Lab (round 15, "lab3d"). A model (Meshy, Sketchfab, Mixamo, Poly Haven,
// Spline exports, any .glb / .gltf / .fbx / .obj / .stl / .ply) becomes a 🧊 model layer whose code is one call,
// lab3d.model(refs.<key>, P, opts), drawn by the sandbox (tools/three-sandbox.html "3D models"); every knob is a tweak()
// slider, so Save, Shuffle, looks and keyframes work, and camera moves are keyframes on Orbit / Crane / Distance / Lens
// on the scene's own clock (they show on the timeline and play in the Lab sequence).
// This file: the knobs (one table → the layer code), the model library (everything downloaded / generated / used, with
// pictures the sandbox takes of each model alone), the picker (a small floating panel: drag a card onto the preview,
// Shift+drop replaces), right-click on the preview → 🧊 3D model, file drops (.glb… → a model, .hdr / .exr → its sky),
// and the operations the chat commands (tools/three-models-cmds.js) and the directors (three_do model) share.
// Everything goes through HubBridge.call, so a director's call lands in its own chat's scene like any three_ tool.
const ThreeModels = (() => {
  const KV = 'lab3d-library';
  const MARK = '🧊 ';
  const MODEL_RE = /\.(glb|gltf|fbx|obj|stl|ply)$/i;
  const SKY_RE = /\.(hdr|exr)$/i;
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map(q).join(', ')}]` : JSON.stringify(v));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const stem = (p) => base(p).replace(/\.[^.]+$/, '').replace(/^\d{10,}-/, '');
  const norm = (s) => String(s || '').toLowerCase().trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fileUrl = (p) => (/^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);

  // ---------- the knobs (sliders), in the groups the Lab's slider panel shows ----------
  const MATERIALS = ['original', 'chrome', 'gold', 'glass', 'toon', 'clay', 'matte', 'wireframe', 'holographic', 'xray', 'normals', 'palette'];
  const LIGHTS = ['studio', 'three-point', 'rim', 'neon', 'golden', 'sunset', 'moody', 'flat'];
  const GROUNDS = ['none', 'shadow', 'mirror', 'floor', 'gloss', 'grid'];
  const SKIES = ['clear', 'hdri', 'color'];
  const n = (key, value, min, max, label, group, step) => ({ key, value, min, max, label, group, ...(step ? { step } : {}) });
  const c = (key, value, label, group) => ({ key, value, label, group });
  const s = (key, options, value, label, group) => ({ key, value, options, label, group });
  const b = (key, value, label, group) => ({ key, value, label, group });
  const KNOBS = [
    n('size', 1, 0.1, 5, 'Size', 'Model'), n('height', 0, -3, 3, 'Height', 'Model'), n('x', 0, -4, 4, 'Left / right', 'Model'), n('z', 0, -4, 4, 'Near / far', 'Model'),
    n('turn', 0, -180, 180, 'Turn (°)', 'Model'), n('tilt', 0, -90, 90, 'Tilt (°)', 'Model'), n('spin', 0.4, -5, 5, 'Turntable (turns / 10 s)', 'Model'),
    n('bob', 0, 0, 2, 'Float', 'Model'), n('explode', 0, 0, 3, 'Explode', 'Model'), b('faceCamera', false, 'Faces the camera', 'Model'), n('detail', 1, 0.05, 1, 'Detail (lower = lighter)', 'Model'),
    s('material', MATERIALS, 'original', 'Material', 'Material'), c('tint', '#ffffff', 'Tint', 'Material'), n('glow', 0, 0, 3, 'Glow', 'Material'),
    { clip: true }, b('play', true, 'Play', 'Animation'), b('loop', true, 'Loop', 'Animation'), n('speed', 1, -2, 3, 'Speed', 'Animation'), n('blend', 0.4, 0, 2, 'Blend (s)', 'Animation'),
    n('orbit', 0, -360, 360, 'Orbit (°)', 'Camera'), n('crane', 12, -30, 85, 'Crane (°)', 'Camera'), n('distance', 1, 0.2, 4, 'Distance', 'Camera'), n('lens', 35, 12, 100, 'Lens (°)', 'Camera'),
    n('camSpin', 0, -3, 3, 'Orbit by itself', 'Camera'), b('aim', true, 'Looks at the model', 'Camera'), n('aimY', 0, -0.5, 0.5, 'Aim higher / lower', 'Camera'),
    s('light', LIGHTS, 'studio', 'Light', 'Light'), n('lights', 1, 0, 3, 'Lights', 'Light'), n('exposure', 1, 0.1, 3, 'Exposure', 'Light'), n('env', 1, 0, 3, 'Reflections', 'Light'), n('lightTurn', 0, -180, 180, 'Turn the lights (°)', 'Light'),
    s('ground', GROUNDS, 'shadow', 'Ground', 'World'), s('sky', SKIES, 'clear', 'Backdrop', 'World'), c('skyColor', '#101014', 'Backdrop color', 'World'), n('skyBlur', 0.2, 0, 1, 'Sky blur', 'World'),
    n('fog', 0, 0, 1, 'Fog', 'World'), c('fogColor', '#101014', 'Fog color', 'World'),
    n('bloom', 0, 0, 3, 'Bloom', 'Effects'), n('dof', 0, 0, 10, 'Depth of field', 'Effects'),
    n('pulse', 0, 0, 2, 'Pulse on kick', 'Music'), n('kickGlow', 0, 0, 3, 'Glow on kick', 'Music'),
  ];
  const DEFAULTS = Object.fromEntries(KNOBS.filter((k) => k.key).map((k) => [k.key, k.value]));
  // the layer's code: the knobs as tweak() sliders (current values kept on a rebuild), then one call
  function code(refKey, name, { hdri = null, clips = [], clipNames = null, values = {} } = {}) {
    const v = (k) => (values[k.key] !== undefined ? values[k.key] : k.value);
    const lines = KNOBS.map((k) => {
      if (k.clip) {
        const names = clipNames?.length ? clipNames : null;
        const cur = values.clip !== undefined ? values.clip : names ? names[0] : 0;
        return names ? `  clip: { value: ${q(names.includes(cur) ? cur : names[0])}, options: ${q(names)}, label: 'Clip', group: 'Animation' },`
          : `  clip: { value: ${Number.isFinite(Number(cur)) ? Number(cur) : 0}, min: 0, max: 20, step: 1, label: 'Clip', group: 'Animation' },`;
      }
      return `  ${k.key}: { value: ${q(v(k))}${k.options ? `, options: ${q(k.options)}` : ''}${k.min != null ? `, min: ${k.min}, max: ${k.max}` : ''}${k.step ? `, step: ${k.step}` : ''}, label: ${q(k.label)}, group: ${q(k.group)} },`;
    });
    const label = String(name || refKey).replace(/[\r\n]+/g, ' ').slice(0, 60);
    const o = [`name: ${q(label)}`, hdri ? `hdri: refs.${hdri}` : null, clips.length ? `clips: [${clips.map((k) => `refs.${k}`).join(', ')}]` : null].filter(Boolean).join(', ');
    return `// ${MARK}${label}: a 3D model (refs.${refKey}) drawn by lab3d.model: every knob below is a slider (keyframe them).
// Camera moves = keyframes on Orbit / Crane / Distance / Lens · /model or three_do model { op } changes it.
const P = tweak({
${lines.join('\n')}
});
lab3d.model(refs.${refKey}, P, { ${o} });
`;
  }
  const isModelCode = (src) => /lab3d\.model\(\s*refs\.\w+/.test(src || '');
  function parseCall(src) {
    const m = /lab3d\.model\(\s*refs\.(\w+)\s*,\s*P\s*,\s*\{([^\n]*)\}\s*\)/.exec(src || '');
    if (!m) return null;
    const o = m[2];
    return { ref: m[1], name: /name:\s*'((?:[^'\\]|\\.)*)'/.exec(o)?.[1]?.replace(/\\'/g, "'") || m[1], hdri: /hdri:\s*refs\.(\w+)/.exec(o)?.[1] || null,
      clips: [...(/clips:\s*\[([^\]]*)\]/.exec(o)?.[1] || '').matchAll(/refs\.(\w+)/g)].map((x) => x[1]) };
  }

  // ---------- what a GLB holds (clip names for the Clip choice), read from its JSON chunk ----------
  async function glbInfo(path) {
    try {
      const st = await window.hub.fs.stat(path);
      if (!st || st.size > 40 * 1048576) return null; // big files: the sandbox reports it once loaded
      const raw = await window.hub.fs.read(path, { encoding: 'buffer', maxBytes: 40 * 1048576 });
      const u = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      let json;
      if (dv.getUint32(0, true) === 0x46546c67) { const len = dv.getUint32(12, true); json = JSON.parse(new TextDecoder().decode(u.subarray(20, 20 + len))); }
      else if (/\.gltf$/i.test(path)) json = JSON.parse(new TextDecoder().decode(u));
      else return null;
      const clips = (json.animations || []).map((a, i) => a.name || `Clip ${i + 1}`);
      let tris = 0;
      for (const m of json.meshes || []) for (const p of m.primitives || []) { const a = json.accessors?.[p.indices ?? p.attributes?.POSITION]; if (a) tris += p.indices != null ? a.count / 3 : a.count / 3; }
      return { clips: [...new Set(clips)], meshes: (json.meshes || []).length, tris: Math.round(tris), mb: +(st.size / 1048576).toFixed(2), draco: (json.extensionsUsed || []).includes('KHR_draco_mesh_compression') };
    } catch { return null; }
  }

  // ---------- the library: everything downloaded / generated / used, with pictures ----------
  let lib = null; // [{ id, name, path, kind: 'model'|'sky'|'clip', source, thumb, at, info }]
  const saveLib = debounce(() => window.hub.kvSet(KV, lib), 400);
  async function library() { lib ||= await window.hub.kvGet(KV, []) || []; return lib; }
  const kindOf = (p) => (SKY_RE.test(p) ? 'sky' : MODEL_RE.test(p) ? 'model' : null);
  async function remember(path, { name, source = 'file', thumb = null, kind = null, info = null } = {}) {
    const L = await library();
    let it = L.find((x) => x.path === path) || L.find((x) => base(x.path) === base(path) && x.name === (name || stem(path)));
    if (!it) { it = { id: `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`, name: name || stem(path), path, kind: kind || kindOf(path) || 'model', source, thumb: null, at: Date.now(), info: null }; L.unshift(it); }
    if (thumb) it.thumb = thumb;
    if (info) it.info = { ...(it.info || {}), ...info };
    if (kind) it.kind = kind;
    it.used = Date.now();
    if (L.length > 300) L.length = 300;
    saveLib();
    return it;
  }
  // the library plus the models Meshy made and the open sketch's model / sky references
  async function all() {
    const L = [...await library()];
    const seen = new Set(L.map((x) => x.path));
    try { for (const m of await window.hub.kvGet('meshy-library', []) || []) if (m.glb && !seen.has(m.glb)) { seen.add(m.glb); L.push({ id: `meshy:${m.id}`, name: m.name, path: m.glb, kind: 'model', source: 'Meshy', thumb: m.thumb || null, at: m.at || 0 }); } } catch { /* no Meshy library */ }
    try { for (const r of ThreeLab.director?.refs.list() || []) if ((r.kind === 'model' || SKY_RE.test(r.name)) && !seen.has(r.path) && !L.some((x) => base(x.path) === r.name)) { seen.add(r.path); L.push({ id: `ref:${r.key}`, name: r.key, path: r.path, kind: SKY_RE.test(r.name) ? 'sky' : 'model', source: 'this sketch', thumb: null, at: r.at || 0 }); } } catch { /* the Lab isn't open */ }
    return L;
  }
  async function findItem(qry) {
    const L = await all();
    const s = String(qry ?? '').trim();
    if (!s || s === 'last' || s === 'newest') return L.filter((x) => x.kind !== 'sky')[0] || null;
    const k = /^#?(\d+)$/.exec(s);
    if (k) return L[Number(k[1]) - 1] || null;
    const w = norm(s);
    return L.find((x) => x.id === s || x.path === s) || L.find((x) => norm(x.name) === w) || L.find((x) => norm(x.name).includes(w)) || null;
  }

  // ---------- reaching the Lab (the scene of the chat that asks, on screen or not) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  // the scene a chat's calls reach: the one on screen, or (round 73, labtools73) its own scene backstage
  const sceneOf = (ctx = {}) => (ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.routeThree('three_layers', ctx.chatId)?.sketchId || null : null);
  function onScreen(ctx = {}) {
    if (!ctx.chatId || typeof ChatScenes === 'undefined') return true;
    const id = sceneOf(ctx);
    return !id || id === ThreeLab.scenes?.currentId();
  }
  const isModelLayer = (L) => (L.sliders || []).includes('Crane (°)') && (L.sliders || []).includes('Material');
  async function modelLayers(ctx) { const v = await call('three_layers', { report: 'full' }, ctx); return (v.layers || []).filter(isModelLayer); }
  async function target(ref, ctx) {
    const ms = await modelLayers(ctx);
    if (!ms.length) throw new Error('No 3D model in this scene yet: /model add <file> or /model library.');
    if (ref != null && ref !== '') { const r = norm(ref).replace(/^🧊\s*/, ''); const hit = ms.find((L) => L.id === ref || norm(L.name) === norm(ref) || norm(L.name).replace(/^🧊\s*/, '') === r) || ms.find((L) => norm(L.name).includes(r)); if (hit) return hit; }
    return ms.find((L) => L.selected) || ms[ms.length - 1];
  }
  async function codeOf(L, ctx) {
    if (onScreen(ctx) && ThreeLab.director) return ThreeLab.director.codeOf(L.id).code;
    const v = await call('three_read_code', { layer: L.id, from: 1, to: 4000, force: true }, ctx); // backstage: plain numbered text
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  async function values(L, ctx) { const v = await call('three_sliders', { layer: L.id, report: 'full' }, ctx); return Object.fromEntries((v.sliders || []).map((x) => [x.key, x.value])); }
  async function setValues(L, set, ctx) { const v = await call('three_sliders', { layer: L.id, set, report: 'full' }, ctx); return v.changed; }

  // ---------- adding / replacing ----------
  // (round 73, labtools73) a chat whose scene isn't on screen gets the file in ITS scene's references (no switch)
  async function addRef(path, ctx = {}) {
    if (!ThreeLab.scenes) await call('three_layers', {}, ctx).catch(() => null); // the Lab starts (in the background) first
    if (!onScreen(ctx)) return ThreeLab.addReference(path, { sketchId: sceneOf(ctx) });
    await ThreeLab.cmd({ show: true });
    return ThreeLab.addReference(path);
  }
  async function add(file, { name = null, ctx = {}, replace = null, source = 'file', values: over = {} } = {}) {
    if (!file) throw new Error('Which model? A file path, a library number (/model library) or "last".');
    if (!/^([a-zA-Z]:[\\/]|\/)/.test(file)) { const it = await findItem(file); if (!it) throw new Error(`Nothing called “${file}” in the model library.`); return it.kind === 'sky' ? sky(it.path, { ctx, name: it.name }) : add(it.path, { name: name || it.name, ctx, replace, source: it.source, values: over }); }
    if (SKY_RE.test(file)) return sky(file, { ctx, name });
    if (!MODEL_RE.test(file)) throw new Error(`${base(file)} isn't a 3D model the Lab reads (.glb, .gltf, .fbx, .obj, .stl, .ply). Spline / Blender: export as GLB.`);
    const st = await window.hub.fs.stat(file).catch(() => null);
    if (!st) throw new Error(`No file at ${file}`);
    const big = st.size > 25 * 1048576;
    const tst = big ? toast(`🧊 Copying ${base(file)} (${Math.round(st.size / 1048576)} MB) into the Lab…`, { timeout: 0 }) : null;
    let r;
    try { r = await addRef(file, ctx); } finally { tst?.remove?.(); }
    const info = await glbInfo(file);
    const label = (name || stem(file)).slice(0, 40);
    await remember(file, { name: label, source, info });
    if (replace) {
      const L = typeof replace === 'object' ? replace : await target(replace === true ? null : replace, ctx);
      const src = await codeOf(L, ctx); const was = parseCall(src) || {};
      const vals = { ...(await values(L, ctx)), ...over };
      if (info?.clips?.length && !info.clips.includes(vals.clip)) vals.clip = info.clips[0];
      await call('three_update_layer', { layer: L.id, code: code(r.key, label, { hdri: was.hdri, clips: was.clips || [], clipNames: info?.clips, values: vals }), settings: { name: `${MARK}${label}` }, wait: 1.5 }, ctx);
      return { layer: `${MARK}${label}`, ref: r.key, replaced: L.name, info };
    }
    const out = await call('three_add_layer', { name: `${MARK}${label}`, code: code(r.key, label, { clipNames: info?.clips, values: over }), wait: 1.5 }, ctx);
    return { layer: out.added || `${MARK}${label}`, ref: r.key, info };
  }
  // a sky: the model layers' light and backdrop; with no model, the apps stream's sky layer
  async function sky(file, { ctx = {}, name = null, layer = null, lightOnly = false } = {}) {
    const ms = await modelLayers(ctx).catch(() => []);
    if (!ms.length) { if (onScreen(ctx) && typeof AppsLab !== 'undefined' && AppsLab.hdriCode) return AppsLab.addHdri(file, { name, legacy: true }); throw new Error(onScreen(ctx) ? 'Add a model first' : 'Add a model to this scene first (three_do model add): a sky lights the model.'); }
    const r = await addRef(file, ctx);
    await remember(file, { name: name || stem(file), kind: 'sky', source: 'sky' });
    const L = layer ? await target(layer, ctx) : ms.find((x) => x.selected) || ms[ms.length - 1];
    await rebuild(L, { hdri: r.key }, ctx);
    if (!lightOnly) await setValues(L, { sky: 'hdri' }, ctx);
    return { layer: L.name, sky: r.key };
  }
  async function noSky(ref, ctx) { const L = await target(ref, ctx); await rebuild(L, { hdri: null }, ctx); await setValues(L, { sky: 'clear' }, ctx); return L.name; }
  // the layer's code again with a change in its call (sky, extra clips), every slider value kept
  async function rebuild(L, change, ctx) {
    const src = await codeOf(L, ctx); const was = parseCall(src);
    if (!was) throw new Error(`${L.name} isn't a model layer made by the Lab (its code doesn't call lab3d.model).`);
    const vals = await values(L, ctx);
    const clipOpt = /clip:\s*\{[^}]*options:\s*(\[[^\]]*\])/.exec(src)?.[1];
    let clipNames = null; try { clipNames = clipOpt ? JSON.parse(clipOpt.replace(/'/g, '"')) : null; } catch { /* number clip */ }
    if (change.addClips?.length) clipNames = clipNames ? [...clipNames, ...change.addClips] : null;
    const next = { hdri: 'hdri' in change ? change.hdri : was.hdri, clips: [...(was.clips || []), ...(change.clipRefs || [])] };
    await call('three_update_layer', { layer: L.id, code: code(was.ref, was.name, { ...next, clipNames, values: vals }), wait: 1.2 }, ctx);
  }
  // Mixamo: an animation file (FBX "without skin", a GLB with clips) joins the model's clips
  async function addClip(file, { layer = null, ctx = {} } = {}) {
    const L = await target(layer, ctx);
    const r = await addRef(file, ctx);
    await remember(file, { kind: 'clip', source: 'clip' });
    const info = await glbInfo(file);
    await rebuild(L, { clipRefs: [r.key], addClips: info?.clips?.length ? info.clips : [stem(file)] }, ctx);
    return { layer: L.name, clip: r.key };
  }

  // ---------- presets on the sliders ----------
  // camera moves: keys on the camera sliders over `secs` from `at` (fractions of the move), on the scene's clock
  const MOVES = {
    orbit: { name: 'Orbit', secs: 8, keys: { orbit: [[0, 0, 'linear'], [1, 360, 'linear']] }, desc: 'A full turn around the model' },
    'half-orbit': { name: 'Half orbit', secs: 5, keys: { orbit: [[0, -90], [1, 90]] }, desc: 'Swings round from one side to the other' },
    'dolly-in': { name: 'Dolly in', secs: 4, keys: { distance: [[0, 1.8], [1, 0.75]] }, desc: 'Moves in on the model' },
    'dolly-out': { name: 'Dolly out', secs: 4, keys: { distance: [[0, 0.7], [1, 1.6]] }, desc: 'Pulls back' },
    'push-in': { name: 'Slow push', secs: 8, keys: { distance: [[0, 1.2], [1, 0.9]] }, desc: 'A slow, steady push' },
    crane: { name: 'Crane up', secs: 5, keys: { crane: [[0, -5], [1, 55]], distance: [[0, 1.05], [1, 1.35]] }, desc: 'Rises and looks down' },
    'crane-down': { name: 'Crane down', secs: 5, keys: { crane: [[0, 60], [1, 8]], distance: [[0, 1.4], [1, 1]] }, desc: 'Comes down to eye level' },
    hero: { name: 'Hero reveal', secs: 5, keys: { distance: [[0, 0.45], [1, 1.05]], crane: [[0, -8], [1, 10]], orbit: [[0, -60], [1, 0]], exposure: [[0, 0.2], [0.6, 1]] }, desc: 'From dark and close, swings round and pulls back to the hero shot' },
    arc: { name: 'Arc in', secs: 5, keys: { orbit: [[0, -45], [1, 45]], distance: [[0, 1.3], [1, 0.9]] }, desc: 'Arcs round while moving in' },
    'fly-by': { name: 'Fly-by', secs: 4, keys: { orbit: [[0, -120], [1, 60]], distance: [[0, 0.6], [0.5, 0.5], [1, 1.4]], crane: [[0, 5], [1, 25]] }, desc: 'Sweeps past close, then away' },
    'top-down': { name: 'Top down', secs: 4, keys: { crane: [[0, 15], [1, 85]] }, desc: 'Rises to look straight down' },
    'low-angle': { name: 'Low angle', secs: 4, keys: { crane: [[0, 25], [1, -15]], distance: [[0, 1.2], [1, 0.9]] }, desc: 'Drops low and looks up: heroic' },
    vertigo: { name: 'Vertigo', secs: 4, keys: { distance: [[0, 0.8], [1, 1.8]], lens: [[0, 45], [1, 20]] }, desc: 'Pulls back while zooming in (dolly zoom)' },
    'reveal-spin': { name: 'Spin reveal', secs: 6, keys: { orbit: [[0, -180], [1, 0]], exposure: [[0, 0], [0.4, 1]] }, desc: 'Fades up from black while the camera swings round' },
    'zoom-punch': { name: 'Zoom punch', secs: 0.5, keys: { lens: [[0, 35], [0.3, 24], [1, 35]] }, desc: 'A quick punch in and back' },
  };
  async function move(id, { layer = null, at = null, secs = null, ctx = {} } = {}) {
    const M = MOVES[norm(id).replace(/\s+/g, '-')] || Object.values(MOVES).find((m) => norm(m.name) === norm(id));
    if (!M) throw new Error(`Camera moves: ${Object.keys(MOVES).join(', ')}`);
    const L = await target(layer, ctx);
    const t0 = at != null ? Number(at) : onScreen(ctx) ? +(ThreeLab.director?.media?.time || 0).toFixed(2) : +(ThreeLab.scenes?.timelineOf?.(sceneOf(ctx))?.time || 0).toFixed(2); // (round 73) backstage: where its playhead was left
    const len = Number(secs) > 0 ? Number(secs) : M.secs;
    for (const [prop, ks] of Object.entries(M.keys)) {
      await call('three_keyframes', { layer: L.id, property: prop, keys: ks.map(([f, value, ease]) => ({ time: +(t0 + f * len).toFixed(3), value, ease: ease || 'ease' })) }, ctx);
      await call('three_timeline_edit', { lane: { layer: L.id, property: prop, show: true } }, ctx).catch(() => {});
    }
    await call('three_timeline_edit', { cues: { add: [{ time: t0, name: `🎥 ${M.name}` }] } }, ctx).catch(() => {});
    return { layer: L.name, move: M.name, from: t0, to: +(t0 + len).toFixed(2), keyed: Object.keys(M.keys) };
  }
  async function clearMoves(ref, ctx) { const L = await target(ref, ctx); for (const p of ['orbit', 'crane', 'distance', 'lens', 'exposure']) await call('three_keyframes', { layer: L.id, property: p, clear: true }, ctx).catch(() => {}); return L.name; }
  // studio looks: several sliders at once
  const LOOKS = {
    product: { name: 'Product shot', set: { light: 'studio', ground: 'shadow', sky: 'clear', material: 'original', bloom: 0, dof: 0, fog: 0, spin: 0.4 } },
    showroom: { name: 'Showroom', set: { light: 'three-point', ground: 'gloss', sky: 'color', skyColor: '#0c0c10', bloom: 0.3, spin: 0.3 } },
    neon: { name: 'Neon night', set: { light: 'neon', ground: 'mirror', sky: 'color', skyColor: '#07040e', bloom: 1.2, fog: 0.25, fogColor: '#12061f' } },
    golden: { name: 'Golden hour', set: { light: 'golden', ground: 'shadow', fog: 0.15, fogColor: '#f2b27a', bloom: 0.4 } },
    noir: { name: 'Noir', set: { light: 'moody', ground: 'floor', sky: 'color', skyColor: '#000000', material: 'matte', fog: 0.3, fogColor: '#000000' } },
    hologram: { name: 'Hologram', set: { material: 'holographic', tint: '#41e2ff', light: 'rim', ground: 'grid', bloom: 1.4, spin: 0.8 } },
    clay: { name: 'Clay render', set: { material: 'clay', light: 'flat', ground: 'shadow', sky: 'color', skyColor: '#e9e4dc', bloom: 0, dof: 0 } },
    cinematic: { name: 'Cinematic', set: { light: 'rim', ground: 'mirror', dof: 4, bloom: 0.6, fog: 0.2, lens: 28 } },
  };
  const FITS = { size: 1, height: 0, x: 0, z: 0, turn: 0, tilt: 0, orbit: 0, crane: 12, distance: 1, lens: 35, aim: true, aimY: 0, explode: 0 };

  // ---------- reading what the sandbox says ----------
  const infos = new Map(); // layer id → { clips, tris, … } once loaded
  addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.source !== 'three-sandbox' || m.type !== 'lab3d') return;
    if (m.ev === 'loaded') infos.set(m.layer, m.info);
    if (m.ev === 'error') toast(`🧊 ${m.name} didn't load: ${m.error}`, { type: 'error', timeout: 9000 });
    if (m.ev === 'thumb' && m.image) thumbFor(m.layer, m.image).catch(() => {});
  });
  async function thumbFor(layerId, image) {
    const D = ThreeLab.director; if (!D) return;
    const src = D.codeOf(layerId)?.code; const p = parseCall(src); if (!p) return;
    const r = D.refs.list().find((x) => x.key === p.ref); if (!r) return;
    const L = await library();
    const it = L.find((x) => base(x.path) === r.name) || L.find((x) => x.path === r.path);
    if (it) { it.thumb = image; saveLib(); } else await remember(r.path, { name: p.name, thumb: image, source: 'this sketch' });
    if (panel?.isConnected) paintPanel();
  }

  // ---------- the picker: a small floating panel (drag a card onto the preview) ----------
  let panel = null; let filterQ = '';
  const icon = (k) => (k === 'sky' ? '🌅' : k === 'clip' ? '🕺' : '🧊');
  async function openLibrary(qry = '') {
    filterQ = qry || '';
    if (!panel) {
      panel = el('div', { class: 'lab3d-panel', role: 'dialog' });
      document.body.append(panel);
    }
    panel.hidden = false;
    await paintPanel();
    panel.querySelector('input')?.focus();
  }
  function closeLibrary() { if (panel) panel.hidden = true; }
  async function paintPanel() {
    const items = await all();
    const ql = norm(filterQ);
    const list = items.filter((x) => !ql || `${x.name} ${x.source} ${x.kind}`.toLowerCase().includes(ql));
    const head = el('div', { class: 'lab3d-head' },
      el('b', { text: '🧊 Models' }),
      el('input', { type: 'search', placeholder: 'Filter…', value: filterQ, on: { input: (e) => { filterQ = e.target.value; paintCards(); } } }),
      el('button', { class: 'ghost small', text: '＋', title: 'Add a model file (GLB, glTF, FBX, OBJ, STL, PLY) or a sky (HDR, EXR)', on: { click: () => pickFile().catch((err) => toast(err.message, { type: 'error' })) } }),
      el('button', { class: 'ghost small', text: '⋯', title: 'Skies, Meshy, Sketchfab, Mixamo', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, getMore()); } } }),
      el('button', { class: 'ghost small', text: '×', title: 'Close (Esc)', on: { click: closeLibrary } }));
    const cards = el('div', { class: 'lab3d-cards' });
    const paintCards = () => {
      const qq = norm(filterQ);
      const shown = items.filter((x) => !qq || `${x.name} ${x.source} ${x.kind}`.toLowerCase().includes(qq));
      cards.replaceChildren(...(shown.length ? shown.map((it) => card(it, items.indexOf(it) + 1)) : [el('p', { class: 'hint', text: items.length ? 'Nothing matches.' : 'No models yet: ＋ adds a file, or drop a .glb on the preview. Meshy, Sketchfab and Poly Haven are in ⋯.' })]));
    };
    panel.replaceChildren(head, cards, el('div', { class: 'lab3d-foot', text: 'Click: add to the Lab · drag onto the preview (Shift: replace the model) · right-click: more' }));
    panel.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeLibrary(); } };
    void list;
    paintCards();
  }
  function card(it, nth) {
    const pic = it.thumb ? el('img', { src: fileUrl(it.thumb), alt: '', loading: 'lazy', draggable: false, on: { error: (e) => e.target.replaceWith(el('span', { text: icon(it.kind) })) } }) : el('span', { text: icon(it.kind) });
    const d = el('div', { class: 'lab3d-card', draggable: true, title: `${it.name} · ${it.source}${it.info?.clips?.length ? ` · ${it.info.clips.length} clips` : ''}${it.info?.tris ? ` · ${Math.round(it.info.tris / 1000)}k triangles` : ''}\n#${nth}: /model add #${nth}`,
      on: {
        click: () => use(it).catch((err) => toast(err.message, { type: 'error', timeout: 6000 })),
        contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, cardMenu(it)); },
        dragstart: (e) => { e.dataTransfer.setData('text/x-hearth-model', it.id); e.dataTransfer.setData('text/plain', it.path); e.dataTransfer.effectAllowed = 'copy'; dragging = it; },
        dragend: () => { dragging = null; },
      } },
    el('div', { class: 'lab3d-pic' }, pic), el('small', { text: it.name }), el('i', { text: `${icon(it.kind)} ${it.source}` }));
    return d;
  }
  async function use(it, { replace = false } = {}) {
    const r = it.kind === 'sky' ? await sky(it.path, { name: it.name }) : it.kind === 'clip' ? await addClip(it.path) : await add(it.path, { name: it.name, source: it.source, replace: replace || null });
    toast(it.kind === 'sky' ? `🌅 ${it.name} lights ${r.layer}` : replace ? `🧊 ${it.name} replaced ${r.replaced}` : `🧊 ${it.name} is in the Lab`, { timeout: 2600 });
    return r;
  }
  function cardMenu(it) {
    return [
      { label: it.kind === 'sky' ? '🌅 Light the model with this sky' : it.kind === 'clip' ? '🕺 Add this animation to the model' : '＋ Add to the Lab', action: () => use(it).catch((e) => toast(e.message, { type: 'error' })) },
      it.kind === 'model' ? { label: '⇄ Replace the model', hint: 'same sliders, keyframes and place', action: () => use(it, { replace: true }).catch((e) => toast(e.message, { type: 'error' })) } : null,
      it.kind === 'model' ? { label: '🕺 Use its animations on the model', hint: 'Mixamo clips', action: () => addClip(it.path).then(() => toast('Its clips are in the Clip slider', { timeout: 2400 })).catch((e) => toast(e.message, { type: 'error' })) } : null,
      it.kind === 'sky' ? { label: '◭ Sky layer only', action: () => AppsLab?.addHdri(it.path, { name: it.name, legacy: true }) } : null,
      '-',
      { label: 'Show the file', action: () => window.hub.fs.reveal(it.path) },
      { label: 'Rename…', action: async () => { const nm = await Modal.prompt('Rename this model', { value: it.name }); if (nm) { const L = await library(); const x = L.find((y) => y.id === it.id) || await remember(it.path, { name: it.name }); x.name = nm; saveLib(); paintPanel(); } } },
      /^(meshy|ref):/.test(it.id) ? null : { label: 'Remove from the library', hint: 'the file stays', action: async () => { const L = await library(); lib = L.filter((x) => x.id !== it.id); saveLib(); paintPanel(); } },
    ].filter(Boolean);
  }
  function getMore() {
    return [
      { label: '🌅 Free skies (Poly Haven)…', action: () => (window.AppsPoly ? AppsPoly.dialog('', 'hdris') : toast('Poly Haven isn\'t available', { type: 'error' })) },
      window.AppsMeshy ? { label: '✦ Make a model with Meshy…', action: () => Commands.tryRun('/meshy', H.claudeAgent?.()?.id) } : null,
      typeof Apps !== 'undefined' ? { label: '⬡ Sketchfab (free models)', action: () => Apps.open('sketchfab') } : null,
      typeof Apps !== 'undefined' ? { label: '🕺 Mixamo (animations)', hint: 'its FBX downloads join the model\'s clips', action: () => Apps.open('mixamo').catch(() => window.hub.openExternal('https://www.mixamo.com')) } : null,
      typeof Apps !== 'undefined' ? { label: '◍ Spline', hint: 'export GLB, then ＋', action: () => Apps.open('spline') } : null,
    ].filter(Boolean);
  }
  async function pickFile() {
    const ps = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '3D models and skies', extensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'hdr', 'exr'] }] });
    const list = Array.isArray(ps) ? ps : ps?.filePaths || [];
    for (const p of list) await add(p);
    return list.length;
  }

  // ---------- drops on the preview, the right-click menu, the gizmo ----------
  let dragging = null; let host = null; let labApi = null;
  function attach(o) {
    labApi = o;
    host = o.previewHost;
    if (!host || host.__lab3d) return;
    host.__lab3d = true;
    host.addEventListener('dragover', (e) => {
      const types = [...(e.dataTransfer?.types || [])];
      if (types.includes('text/x-hearth-model') || [...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); host.classList.add('drop-on'); }
    }, true);
    host.addEventListener('drop', (e) => {
      const id = e.dataTransfer?.getData('text/x-hearth-model');
      const files = [...(e.dataTransfer?.files || [])].map((f) => window.hub.pathForFile(f)).filter((p) => MODEL_RE.test(p) || SKY_RE.test(p));
      if (!id && !files.length) return;
      e.preventDefault(); e.stopPropagation(); host.classList.remove('drop-on');
      const replace = e.shiftKey;
      (async () => {
        if (id) { const it = (await all()).find((x) => x.id === id) || dragging; if (it) await use(it, { replace }); return; }
        for (const p of files) {
          if (/\.fbx$/i.test(p) && (await modelLayers().catch(() => [])).length && e.altKey) { await addClip(p); continue; }
          const r = await add(p, { replace: replace || null });
          toast(SKY_RE.test(p) ? `🌅 ${stem(p)} lights the model` : `🧊 ${stem(p)} is in the Lab${r.info?.clips?.length ? ` (${r.info.clips.length} clips)` : ''}`, { timeout: 2600 });
        }
      })().catch((err) => toast(err.message, { type: 'error', timeout: 7000 }));
    }, true);
  }
  // the scene editor's gizmo on the model (W move · E rotate · R scale · Q world / local · F focus), placements kept
  async function gizmo(mode = 'translate', ref = null) {
    const L = await target(ref, {});
    const c = await ThreeLab.cmd({ show: true });
    c.selectLayer(L.id);
    await sleep(80);
    c.edit(true);
    await sleep(350);
    labApi?.send?.({ type: 'edit', cmd: 'select', path: '#Model' });
    const m = { move: 'translate', rotate: 'rotate', scale: 'scale' }[mode] || mode;
    if (['translate', 'rotate', 'scale'].includes(m)) labApi?.send?.({ type: 'edit', cmd: 'mode', value: m });
    return L.name;
  }
  // right-click the preview → 🧊 3D model
  function previewItem() {
    const quick = (fn, ok) => () => fn().then((r) => ok && toast(typeof ok === 'function' ? ok(r) : ok, { timeout: 2200 })).catch((e) => toast(e.message, { type: 'error', timeout: 6000 }));
    const sl = (set, ok) => quick(async () => setValues(await target(null, {}), set, {}), ok);
    return { label: '🧊 3D model', items: () => {
      const D = ThreeLab.director;
      const has = Boolean(D && (D.layers().layers || []).some(isModelLayer));
      const info = has ? [...infos.values()].pop() : null;
      const base0 = [
        { label: '🧊 Model library…', hint: 'drag one onto the picture', action: () => openLibrary() },
        { label: '＋ Add a model file…', hint: 'GLB · FBX · OBJ · STL', action: quick(pickFile) },
      ];
      if (!has) return [...base0, { label: '🌅 Free skies (Poly Haven)…', action: () => window.AppsPoly?.dialog('', 'hdris') }];
      return [...base0, '-',
        { label: 'Material', items: () => MATERIALS.map((m) => ({ label: m, action: sl({ material: m }, `Material: ${m}`) })) },
        { label: 'Look', items: () => Object.entries(LOOKS).map(([id, l]) => ({ label: l.name, hint: id, action: sl(l.set, l.name) })) },
        { label: 'Camera move', hint: 'keyframes from the playhead', items: () => [...Object.entries(MOVES).map(([id, m]) => ({ label: `🎥 ${m.name}`, hint: `${m.secs} s`, action: quick(() => move(id), (r) => `🎥 ${r.move}: ${r.from}–${r.to} s`) })), '-', { label: 'Remove the camera moves', action: quick(() => clearMoves(null, {}), 'Camera moves removed') }] },
        info?.clips?.length ? { label: 'Animation', hint: `${info.clips.length} clips`, items: () => [...info.clips.slice(0, 24).map((cn) => ({ label: cn, checked: info.clip === cn, action: sl({ clip: cn, play: true }, `▶ ${cn}`) })), '-', { label: '❚❚ Pause', action: sl({ play: false }) }, { label: 'Half speed', action: sl({ speed: 0.5 }) }, { label: 'Normal speed', action: sl({ speed: 1 }) }] } : null,
        { label: 'Light', items: () => [...LIGHTS.map((l) => ({ label: l, action: sl({ light: l }, `Light: ${l}`) })), '-', { label: '🌅 HDRI sky (Poly Haven)…', action: () => window.AppsPoly?.dialog('', 'hdris') }, { label: 'No sky', action: quick(() => noSky(null, {}), 'Sky off') }] },
        { label: 'Ground', items: () => GROUNDS.map((g) => ({ label: g === 'shadow' ? 'shadow catcher' : g === 'mirror' ? 'mirror (reflections)' : g, action: sl({ ground: g }) })) },
        { label: 'Motion', items: () => [{ label: 'Turntable', action: sl({ spin: 1 }) }, { label: 'Still', action: sl({ spin: 0, camSpin: 0 }) }, { label: 'Explode view', action: sl({ explode: 1 }) }, { label: 'Put it back together', action: sl({ explode: 0 }) }, { label: 'Float', action: sl({ bob: 1 }) }, { label: 'Pulse and glow on the kick', action: sl({ pulse: 0.8, kickGlow: 1.2 }, 'Reacts to the kick') }, { label: 'Calm (no music)', action: sl({ pulse: 0, kickGlow: 0 }) }] },
        { label: 'Effects', items: () => [{ label: 'Bloom', action: sl({ bloom: 0.9 }) }, { label: 'Depth of field', action: sl({ dof: 4 }) }, { label: 'Fog', action: sl({ fog: 0.3 }) }, { label: 'None', action: sl({ bloom: 0, dof: 0, fog: 0 }) }] },
        '-',
        { label: '✥ Move / rotate / scale', hint: 'W · E · R', action: quick(() => gizmo('translate')) },
        { label: '⌖ Fit to the frame', action: sl(FITS, 'Fitted') },
        { label: '⇄ Replace the model…', action: () => openLibrary() },
        info?.heavy ? { label: '🪶 Make it lighter', hint: `${Math.round(info.tris / 1000)}k triangles`, action: sl({ detail: 0.4 }, 'Simplifying…') } : null,
      ].filter(Boolean);
    } };
  }

  // ---------- the director's three_do model { op } (and the chat commands' shared core) ----------
  const pick = (list, v) => list.find((x) => norm(x) === norm(v)) || list.find((x) => norm(x).startsWith(norm(v)));
  async function op(a = {}, ctx = {}) {
    const o = norm(a.op || 'info');
    const lay = a.layer ?? null;
    const done = async (L, set, extra = {}) => ({ layer: L.name, changed: await setValues(L, set, ctx), ...extra });
    if (o === 'help') return HELP;
    if (o === 'list' || o === 'library') return (await all()).slice(0, Number(a.max) || 30).map((x, i) => `#${i + 1} ${icon(x.kind)} ${x.name} (${x.source}${x.info?.clips?.length ? `, clips: ${x.info.clips.slice(0, 6).join(' / ')}` : ''})`);
    if (o === 'add') return add(a.file || a.item || a.path || 'last', { name: a.name, ctx, values: a.values || {} });
    if (o === 'replace') return add(a.file || a.item || a.path, { name: a.name, ctx, replace: lay || true });
    if (o === 'info') { const ms = await modelLayers(ctx); return { models: ms.map((L) => ({ layer: L.name, loaded: infos.get(L.id) || 'loading or not on screen' })), materials: MATERIALS, lights: LIGHTS, grounds: GROUNDS, moves: Object.keys(MOVES), looks: Object.keys(LOOKS) }; }
    if (o === 'clipfile' || o === 'mixamo') return addClip(a.file || a.path, { layer: lay, ctx });
    if (o === 'sky' || o === 'hdri') {
      if (/^(off|none)$/i.test(String(a.query || a.file || ''))) return { layer: await noSky(lay, ctx), sky: null };
      if (a.file || a.path) return sky(a.file || a.path, { ctx, layer: lay, lightOnly: Boolean(a.lightOnly) });
      if (!window.AppsPoly) throw new Error('Poly Haven isn\'t available here: pass a file (.hdr / .exr).');
      const found = await AppsPoly.search(String(a.query || 'studio'), 'hdris');
      if (!found.length) throw new Error(`No Poly Haven sky for “${a.query}”.`);
      const p = await AppsPoly.fetchAsset(found[0].id, 'hdris', a.res || '1k');
      return { ...(await sky(p, { ctx, layer: lay, name: found[0].name || found[0].id, lightOnly: Boolean(a.lightOnly) })), from: `Poly Haven ${found[0].id}` };
    }
    if (o === 'move' || o === 'camera') return move(a.preset || a.move || 'orbit', { layer: lay, at: a.at, secs: a.secs, ctx });
    if (o === 'clearmoves') return { cleared: await clearMoves(lay, ctx) };
    const L = await target(lay, ctx);
    if (o === 'set') return done(L, a.values || {});
    if (o === 'material') { const m = pick(MATERIALS, a.preset || a.material || 'original'); if (!m) throw new Error(`Materials: ${MATERIALS.join(', ')}`); return done(L, { material: m, ...(a.tint ? { tint: a.tint } : {}) }); }
    if (o === 'look') { const k = Object.keys(LOOKS).find((x) => x === norm(a.preset) || norm(LOOKS[x].name) === norm(a.preset)); if (!k) throw new Error(`Looks: ${Object.keys(LOOKS).join(', ')}`); return done(L, LOOKS[k].set, { look: LOOKS[k].name }); }
    if (o === 'light') { const l = pick(LIGHTS, a.preset || 'studio'); if (!l) throw new Error(`Lights: ${LIGHTS.join(', ')}`); return done(L, { light: l }); }
    if (o === 'ground') { const g = pick(GROUNDS, a.preset || a.kind || 'shadow'); if (!g) throw new Error(`Grounds: ${GROUNDS.join(', ')}`); return done(L, { ground: g }); }
    if (o === 'clip') {
      const set = {};
      if (a.name != null || a.clip != null) set.clip = a.name ?? a.clip;
      if (a.next) { const inf = infos.get(L.id); if (inf?.clips?.length) set.clip = inf.clips[(inf.clips.indexOf(inf.clip) + 1) % inf.clips.length]; }
      for (const k of ['speed', 'loop', 'blend', 'play']) if (a[k] != null) set[k] = a[k];
      if (set.clip != null && set.play == null) set.play = true;
      return done(L, set, { clips: infos.get(L.id)?.clips || 'unknown until it loads' });
    }
    if (o === 'turntable') return done(L, { spin: a.speed != null ? Number(a.speed) : 1 });
    if (o === 'explode') return done(L, { explode: a.amount != null ? Number(a.amount) : 1 });
    if (o === 'fx') return done(L, Object.fromEntries(['fog', 'bloom', 'dof', 'fogColor'].filter((k) => a[k] != null).map((k) => [k, a[k]])));
    if (o === 'react') return done(L, a.off ? { pulse: 0, kickGlow: 0 } : { pulse: a.pulse ?? 0.8, kickGlow: a.glow ?? 1.2 });
    if (o === 'fit') return done(L, FITS);
    if (o === 'lite') return done(L, { detail: a.detail != null ? Number(a.detail) : 0.4 });
    if (o === 'aim' || o === 'lookat') return done(L, { aim: a.on !== false });
    if (o === 'gizmo') { if (!onScreen(ctx)) throw new Error('The move / rotate / scale handles are for the owner, on screen. Backstage, place it with op set {values: {x, z, height, turn, tilt, size}}.'); return { editing: await gizmo(a.mode || 'translate', lay) }; }
    throw new Error(`model ops: ${OPS}`);
  }
  const OPS = 'list | add {file|item, name} | replace {item, layer} | set {values} | material {preset, tint} | look {preset} | light {preset} | sky {query|file|"off"} | ground {preset} | clip {name|next, speed, loop, blend, play} | clipfile {file} (Mixamo) | move {preset, at, secs} | clearmoves | turntable {speed} | explode {amount} | fx {fog, bloom, dof} | react {pulse, glow | off} | fit | lite {detail} | aim {on} | info';
  const HELP = `3D MODELS (three_do model { op }): a model is a 🧊 layer drawn by lab3d.model(refs.key, P, opts); every knob is a slider (three_sliders / keyframes work).
ops: ${OPS}.
item = library number "#2", a name, "last" or a file path; materials: ${MATERIALS.join(', ')}; lights: ${LIGHTS.join(', ')}; grounds: ${GROUNDS.join(', ')}; looks: ${Object.keys(LOOKS).join(', ')}.
Camera moves (${Object.keys(MOVES).join(', ')}) are keyframes on Orbit / Crane / Distance / Lens from the playhead (or at) on the scene's clock, with a cue; tune them with three_do keyframes. Music reacts only via react (Pulse / Glow on kick).`;

  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_model'], async (tool, args, ctx) => {
    try { return { ok: true, value: await op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  return { attach, previewItem, openLibrary, closeLibrary, library: all, remember, findItem, add, sky, noSky, addClip, move, clearMoves, gizmo, op, code, parseCall, isModelCode, glbInfo, target, setValues,
    infos, KNOBS, DEFAULTS, MATERIALS, LIGHTS, GROUNDS, MOVES, LOOKS, FITS, HELP };
})();
window.ThreeModels = ThreeModels;
