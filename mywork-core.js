// (round 134, starters134) ★ My work: the owner's past scenes, templates, standout layers and looks in one library
// (docs/upgrades/starters134.md). The pure part: gather the items from what Hearth already keeps, score the layers,
// search and filter, copy a scene's layers with fresh ids, recolor a layer to a palette, and the ✦ "Like my past work"
// prompt, its cost and its answer. Loads in Node (no DOM, no window).
const MyWorkCore = (() => {
  const HEX = /^#[0-9a-f]{6}$/i;
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const DAY = 86400000;
  const colors = (p) => (Array.isArray(p) ? p.filter((c) => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase()).slice(0, 8) : []);
  const palKey = (p) => colors(p).join(',');

  // the time a Lab id was made: scenes are s<base36 ms>…, layers l<base36 ms>… (8 base-36 digits since 2014)
  function bornOf(id) {
    const m = /^[sl]([0-9a-z]{8})/.exec(String(id || ''));
    if (!m) return 0;
    const t = parseInt(m[1], 36);
    return t > Date.UTC(2020, 0, 1) && t < Date.UTC(2100, 0, 1) ? t : 0;
  }

  // what a layer is, in one word, from its code (for the cards and the AI's summary)
  const KINDS = [
    ['type', /TextGeometry|FontLoader|troika|fillText|\blyrics\b/i],
    ['particles', /Points\b|PointsMaterial|particle/i],
    ['shader', /ShaderMaterial|RawShaderMaterial|gl_FragColor|fragmentShader/],
    ['model', /GLTFLoader|FBXLoader|OBJLoader|loadModel/],
    ['video', /VideoTexture|<video|\bvideo\b/i],
    ['filter', /\bfilter\s*\(|EffectComposer|ShaderPass|@filter/],
  ];
  function layerKind(code = '') {
    const s = String(code || '');
    for (const [k, re] of KINDS) if (re.test(s)) return k;
    return /THREE\./.test(s) ? '3d' : 'layer';
  }

  // the signs the owner worked on a layer: keyframes, saved looks, music links, locks, set-aside values
  function editsOf(L = {}, ex = {}) {
    let n = 0;
    const keys = L.keys && typeof L.keys === 'object' ? L.keys : L.keyframes && typeof L.keyframes === 'object' ? L.keyframes : {};
    for (const v of Object.values(keys)) n += Array.isArray(v) ? v.length : 1;
    n += Array.isArray(ex.looks) ? ex.looks.length * 2 : 0;
    n += ex.bindings && typeof ex.bindings === 'object' ? Object.keys(ex.bindings).length : 0;
    n += Array.isArray(ex.locks) ? ex.locks.length : 0;
    n += L.overrides && typeof L.overrides === 'object' ? Object.keys(L.overrides).length : 0;
    if (Number(L.edits) > 0) n += Number(L.edits);
    return n;
  }
  // the local score of a layer: renders of its scene since it was made, how long it was kept, the edits on it
  function score({ renders = 0, keptDays = 0, edits = 0 } = {}) {
    return Math.round((renders * 3 + Math.min(keptDays, 90) / 15 + Math.min(edits, 12) * 0.5) * 10) / 10;
  }
  const STANDOUT = 3; // a layer at or over this is a standout
  function why({ renders = 0, keptDays = 0, edits = 0 } = {}) {
    return [renders ? `rendered ${renders}×` : '', keptDays >= 7 ? `kept ${Math.round(keptDays)} days` : '', edits ? `${edits} edit${edits === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  }

  // renders of a scene: a render whose title or file names it (the Lab's files are named after the scene), or one of the
  // project's renders when the scene is the project's main scene
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  function rendersOf(scene, renders = [], projRenders = []) {
    const n = slug(scene.name);
    const own = n.length >= 3 ? renders.filter((r) => r && r.status !== 'failed' && !r.trashed && slug(`${r.title || ''} ${String(r.output || '').split(/[\\/]/).pop()}`).includes(n)) : [];
    const ids = new Set(own.map((r) => r.id));
    return [...own, ...projRenders.filter((r) => r && !ids.has(r.id))].map((r) => ({ id: r.id, at: Number(r.ended || r.at || 0) }));
  }

  // ---------- the library ----------
  // src: { projects: [{ id, name, notes, workspace: { sceneId, palette }, items }], scenes: [sketch], thumbs: { id: { url } },
  //        renders: [render], templates: [{ id, name, cover, palette, layers: [{ name, code }], project: bool, at }],
  //        extras: { sceneId: { looks, layers: { layerId: { looks, bindings, locks } } } }, now }
  function gather(src = {}) {
    const now = Number(src.now) || Date.now();
    const scenes = (src.scenes || []).filter((x) => x && x.id);
    const byId = new Map(scenes.map((x) => [x.id, x]));
    const thumbs = src.thumbs || {};
    const extras = src.extras || {};
    const renders = Array.isArray(src.renders) ? src.renders : [];
    const projects = (src.projects || []).filter((p) => p && p.id);
    const projOf = new Map(); // sceneId → project (its main scene first)
    for (const p of projects) {
      const main = p.workspace?.sceneId;
      if (main && !projOf.has(main)) projOf.set(main, p);
    }
    for (const p of projects) for (const it of p.items || []) if (it?.type === 'scene' && !projOf.has(it.ref)) projOf.set(it.ref, p);
    const items = [];
    const pj = (p) => (p ? { id: p.id, name: p.name } : null);
    const layersOf = (x) => (Array.isArray(x.layers) && x.layers.length ? x.layers : [{ id: 'main', name: x.name, code: x.code || '' }]);
    // every past project's main scene (and any other scene of mine that has a picture or was kept a while)
    const done = new Set();
    const sceneItem = (x, p) => {
      if (done.has(x.id)) return;
      done.add(x.id);
      const Ls = layersOf(x);
      items.push({ key: `scene:${x.id}`, kind: 'scene', name: x.name || 'Scene', sceneId: x.id, project: pj(p), main: Boolean(p && p.workspace?.sceneId === x.id), thumb: thumbs[x.id]?.url || null,
        palette: colors(x.palette || p?.workspace?.palette), at: Number(x.updatedAt) || bornOf(x.id), layers: Ls.length, kinds: [...new Set(Ls.map((L) => layerKind(L.code)))] });
    };
    for (const p of projects) { const x = byId.get(p.workspace?.sceneId); if (x) sceneItem(x, p); }
    for (const x of scenes) if (projOf.has(x.id) || thumbs[x.id]) sceneItem(x, projOf.get(x.id) || null);
    // saved templates (the project templates and the Lab's)
    for (const t of src.templates || []) {
      if (!t?.id) continue;
      const Ls = Array.isArray(t.layers) ? t.layers : [];
      items.push({ key: `template:${t.id}`, kind: 'template', name: t.name || 'Template', templateId: t.id, projectTemplate: Boolean(t.project), project: null, thumb: t.cover || null,
        palette: colors(t.palette), at: Number(t.at) || 0, layers: Ls.length, kinds: [...new Set(Ls.map((L) => layerKind(L.code)))] });
    }
    // standout layers: kept a long time, rendered, edited
    const layers = [];
    for (const x of scenes) {
      if (!done.has(x.id)) continue;
      const p = projOf.get(x.id) || null;
      const projRenders = p && p.workspace?.sceneId === x.id ? (p.items || []).filter((it) => it?.type === 'render').map((it) => ({ id: it.ref, ended: it.at || 0 })) : [];
      const rs = rendersOf(x, renders, projRenders);
      const ex = extras[x.id] || {};
      const saved = Number(x.updatedAt) || now;
      for (const L of layersOf(x)) {
        if (!String(L.code || '').trim()) continue;
        const born = bornOf(L.id) || bornOf(x.id) || saved;
        const lex = L.id === 'main' ? ex : ex.layers?.[L.id] || {};
        const s = { renders: rs.filter((r) => !r.at || r.at >= born).length, keptDays: Math.max(0, (saved - born) / DAY), edits: editsOf(L, lex) };
        const sc = score(s);
        if (sc < STANDOUT) continue;
        layers.push({ key: `layer:${x.id}:${L.id}`, kind: 'layer', name: L.name || 'Layer', sceneId: x.id, layerId: L.id, sceneName: x.name || 'Scene', project: pj(p), thumb: thumbs[x.id]?.url || null,
          palette: colors(x.palette || p?.workspace?.palette), at: saved, score: sc, why: why(s), kinds: [layerKind(L.code)] });
      }
    }
    layers.sort((a, b) => b.score - a.score || b.at - a.at);
    items.push(...layers.slice(0, 40));
    // looks: each palette I used (a project's, a scene's, a template's), and the slider looks I saved on layers
    const pals = new Map();
    const addPal = (p, name, from, at = 0) => { const k = palKey(p); if (k.split(',').length < 2 || pals.has(k)) return; pals.set(k, { key: `look:pal:${k}`, kind: 'look', look: 'palette', name, palette: colors(p), project: from, thumb: null, at }); };
    for (const p of projects) addPal(p.workspace?.palette, `${p.name} palette`, pj(p), Number(p.at || p.updatedAt) || 0);
    for (const it of items.slice()) if (it.palette?.length && (it.kind === 'scene' || it.kind === 'template')) addPal(it.palette, `${it.name} colors`, it.project, it.at);
    items.push(...pals.values());
    for (const x of scenes) {
      if (!done.has(x.id)) continue;
      const ex = extras[x.id] || {};
      for (const L of layersOf(x)) {
        const lex = L.id === 'main' ? ex : ex.layers?.[L.id] || {};
        for (const lk of Array.isArray(lex.looks) ? lex.looks.slice(0, 6) : []) {
          if (!lk?.name || !lk.values || typeof lk.values !== 'object') continue;
          const pal = colors(Object.values(lk.values).filter((v) => typeof v === 'string'));
          items.push({ key: `look:sl:${x.id}:${L.id}:${lk.name}`, kind: 'look', look: 'sliders', name: `${lk.name} (${L.name || 'layer'})`, sceneId: x.id, layerId: L.id, values: clone(lk.values), palette: pal, project: pj(projOf.get(x.id)), thumb: thumbs[x.id]?.url || null, at: Number(x.updatedAt) || 0 });
        }
      }
    }
    return items;
  }

  // ---------- search and filters ----------
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => { const x = rgb(a); const y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  // two palettes look alike: at least two of a's colors (or all, if fewer) are close to one of b's
  function near(a, b, within = 48) {
    const A = colors(a); const B = colors(b);
    if (!A.length || !B.length) return false;
    const hits = A.filter((c) => B.some((d) => dist(c, d) <= within)).length;
    return hits >= Math.min(2, A.length);
  }
  const KIND_OF = { scene: ['scene', 'template'], layer: ['layer'], look: ['look'] };
  // f: { q, kind: '' | 'scene' | 'layer' | 'look', project: id, look: [colors] }
  function filter(items = [], f = {}) {
    const words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((it) => {
      if (f.kind && !(KIND_OF[f.kind] || [f.kind]).includes(it.kind)) return false;
      if (f.project && it.project?.id !== f.project) return false;
      if (f.look?.length && !near(it.palette, f.look)) return false;
      if (!words.length) return true;
      const hay = [it.name, it.sceneName, it.project?.name, it.kind, it.look, ...(it.kinds || []), it.why, ...(it.palette || [])].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  // the palettes to filter by (swatch rows): the distinct palettes, newest first
  function looks(items = [], max = 10) {
    const seen = new Set(); const out = [];
    for (const it of [...items].sort((a, b) => (b.at || 0) - (a.at || 0))) {
      const k = palKey(it.palette);
      if (k.split(',').length < 2 || seen.has(k)) continue;
      seen.add(k); out.push({ key: k, name: it.kind === 'look' ? it.name : `${it.name} colors`, palette: colors(it.palette) });
      if (out.length >= max) break;
    }
    return out;
  }
  function projectsOf(items = []) {
    const m = new Map();
    for (const it of items) if (it.project && !m.has(it.project.id)) m.set(it.project.id, it.project);
    return [...m.values()];
  }

  // ---------- copies with fresh ids (the originals are never touched) ----------
  // a scene's layers as new layers: every id fresh (except "main", which names the scene's first layer slot), the
  // per-layer extras (looks, music links, locks) moved to the new ids; nothing shared with the source
  function freshLayers(layers = [], extras = {}, newId = () => `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`) {
    const map = new Map();
    const used = new Set();
    const Ls = clone(layers || []).map((L, i) => {
      let id = L.id === 'main' ? 'main' : newId();
      while (used.has(id) || (id !== 'main' && id === L.id)) id = `${newId()}${i}`;
      used.add(id); map.set(L.id, id);
      return { ...L, id, slot: L.slot ?? i };
    });
    const ex = clone(extras || {}) || {};
    for (const k of ['frame', 'timeline', 'media', 'midi', 'selectedLayer']) delete ex[k];
    if (ex.layers && typeof ex.layers === 'object') ex.layers = Object.fromEntries(Object.entries(ex.layers).filter(([k]) => map.has(k)).map(([k, v]) => [map.get(k), v]));
    return { layers: Ls, extras: ex, map };
  }
  // one layer, ready to add to another scene: its code, blend, opacity, keyframes; a new id is the Lab's to give
  function layerCopy(L = {}) {
    const c = clone(L) || {};
    return { name: c.name || 'Layer', code: c.code || '', props: { ...(c.blend ? { blend: c.blend } : {}), ...(c.opacity != null ? { opacity: c.opacity } : {}) }, keys: c.keys || null };
  }

  // ---------- ✦ Like my past work ----------
  // the compact summary the AI reads: titles, palettes, layer kinds (no code, no paths, no pictures)
  function summary(items = [], max = 36) {
    const pick = [...items.filter((x) => x.kind === 'scene' || x.kind === 'template'), ...items.filter((x) => x.kind === 'layer'), ...items.filter((x) => x.kind === 'look' && x.look === 'palette')].slice(0, max);
    return pick.map((it, i) => {
      const bits = [it.kind === 'template' ? 'template' : it.kind, it.kinds?.length ? it.kinds.join('+') : '', it.palette?.length ? it.palette.slice(0, 5).join(' ') : '', it.project ? `in ${it.project.name}` : '', it.why || ''].filter(Boolean);
      return `[w${i + 1}] ${String(it.name).slice(0, 60)} · ${bits.join(' · ')}`;
    });
  }
  const HEAD = 'Suggest 3 starting points from my past work';
  function prompt({ brief = '', project = '', lines = [] } = {}) {
    return [
      `${HEAD} for this project.`,
      `Project: ${String(project || 'untitled').slice(0, 80)}`,
      `Brief: ${String(brief || '(none: go by the project name)').replace(/\s+/g, ' ').slice(0, 600)}`,
      'My library (id · kind · layer kinds · palette · project):',
      ...lines,
      'Reply with JSON only: {"ideas":[{"id":"w3","title":"short title","why":"one plain sentence: why it fits the brief and what to change first"}]} with exactly 3 ideas, each id from the library (prefer scenes and templates; a layer or a palette is fine).',
    ].join('\n');
  }
  // the answer: 3 ideas, each pointing at a real library item
  function parse(text = '', items = []) {
    const m = String(text).match(/\{[\s\S]*\}/);
    let j = null;
    try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
    // (the ids are w<n>, in the order summary() listed them)
    const order = [...items.filter((x) => x.kind === 'scene' || x.kind === 'template'), ...items.filter((x) => x.kind === 'layer'), ...items.filter((x) => x.kind === 'look' && x.look === 'palette')];
    const out = [];
    for (const idea of Array.isArray(j?.ideas) ? j.ideas : []) {
      const n = Number(String(idea?.id || '').replace(/^w/i, '')) - 1;
      const it = order[n];
      if (!it || out.some((o) => o.item.key === it.key)) continue;
      out.push({ title: String(idea.title || it.name).slice(0, 80), why: String(idea.why || '').slice(0, 300), item: it });
      if (out.length === 3) break;
    }
    return out;
  }
  // the cost, shown before anything is sent: a lean helper run, its small prompt and a short JSON answer
  const estimate = (text = '') => ({ input: Math.round(900 + String(text).length / 3.6), output: 350 });
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude') => `About ${kfmt(c.input)} tokens in and ${kfmt(c.output)} out · ${who} (the cheapest helper)`;

  return { HEX, colors, palKey, bornOf, layerKind, editsOf, score, STANDOUT, why, rendersOf, gather, near, filter, looks, projectsOf, freshLayers, layerCopy, summary, HEAD, prompt, parse, estimate, costLine };
})();
if (typeof module !== 'undefined') module.exports = MyWorkCore;
