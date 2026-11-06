// (round 136, outline136) ✦ Name these for me: plain names for the Lab's layers from their code and sliders, on this
// computer, no AI ("Glow ring", "Bass particles", "Gradient backdrop", "Film grain"); and the optional ✦ AI pass (its
// prompt, its cost line, its answer checked). Pure, no DOM; loads in Node (dev/checks/outline136.js uses it in the app).
const OutlineCore = (() => {
  const MAX = 40;
  // a name that says nothing yet: these are what "Name these for me" renames when no layer is picked
  const GENERIC = /^(?:[✦◇🅰🧊◫📁]\s*)?(?:layer|new layer|untitled|empty layer|main|scene|sketch|code|copy|paste)(?:\s*\d+)?(?:\s+copy(?:\s*\d+)?)*$/i;
  const isGeneric = (name) => GENERIC.test(String(name || '').trim()) || /\scopy(\s*\d+)?$/i.test(String(name || '').trim());
  const strip = (code) => String(code || '').replace(/\/\*(?!\s*glsl)[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
  const count = (s, re) => (s.match(re) || []).length;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  // a filter's type → its plain name
  const FILTERS = [
    [/bloom/, 'Bloom'], [/glow/, 'Glow'], [/trail|feedback|echo|afterimage/, 'Trails'], [/kaleido/, 'Kaleidoscope'],
    [/rgb|chroma|split|aberr/, 'Colour split'], [/grain|film|noise/, 'Film grain'], [/pixel|mosaic/, 'Pixelate'],
    [/mirror|symmetr/, 'Mirror'], [/vignette/, 'Vignette'], [/zoomblur|radial/, 'Zoom blur'], [/blur/, 'Blur'],
    [/displace|warp|ripple/, 'Displacement'], [/gradient|ramp|duotone|tint|colou?r/, 'Colour ramp'], [/strobe|flash/, 'Strobe'],
    [/scan|crt|vhs/, 'Scanlines'], [/glitch/, 'Glitch'],
  ];
  // geometry → its noun (singular, plural)
  const SHAPES = [
    ['TorusKnot', 'Knot', 'Knots'], ['Torus', 'Ring', 'Rings'], ['Ring', 'Ring', 'Rings'], ['Sphere', 'Orb', 'Orbs'],
    ['Icosahedron', 'Crystal', 'Crystals'], ['Octahedron', 'Crystal', 'Crystals'], ['Dodecahedron', 'Crystal', 'Crystals'],
    ['Box', 'Cube', 'Cubes'], ['Cylinder', 'Tube', 'Tubes'], ['Tube', 'Tube', 'Tubes'], ['Cone', 'Cone', 'Cones'],
    ['Capsule', 'Capsule', 'Capsules'], ['Circle', 'Disc', 'Discs'], ['Plane', 'Plane', 'Planes'], ['Shape', 'Shape', 'Shapes'],
    ['Extrude', 'Shape', 'Shapes'], ['Lathe', 'Vase', 'Vases'],
  ];
  // music words in the code and the slider labels: the most used one names the layer ("Bass particles")
  const MUSIC = [['Bass', /\b(?:u?bass|lows?|sub)\b|bands?\.(?:bass|low)|['"](?:bass|low)['"]/gi], ['Kick', /\bu?kick\b|['"]kick['"]/gi], ['Snare', /\bu?snare\b|['"]snare['"]/gi], ['Hi-hat', /\bhi-?hats?\b|\bhats?\b|['"]hats?['"]/gi]];
  const BEAT = /\bonBeat\b|\beveryBeats\b|\bonBar\b|['"]beat['"]/g;
  const GLOW = /\bbloom\b|\bglow\w*|\bemissive\w*|UnrealBloom/gi;

  // one layer → a plain name. L: { name, code, sliders: [labels], precomp? }
  function nameFor(L) {
    if (L?.precomp) return null; // a ◫ precomp keeps its scene's name
    const raw = String(L?.code || '');
    const code = strip(raw);
    const words = `${code}\n${(L.sliders || []).join('\n')}`;
    const f = /\bfilter\(\s*['"]([\w-]+)['"]/.exec(code);
    if (f) { const t = f[1].toLowerCase(); return (FILTERS.find(([re]) => re.test(t)) || [null, cap(t.replace(/[-_]+/g, ' '))])[1]; }
    let noun = null; let modOk = true;
    if (/\blab3d\.model\(|GLTFLoader|\.(?:gltf|glb)\b/.test(code)) { noun = '3D model'; modOk = false; }
    else if (/\blyrics?\b/i.test(code) && /\b(?:type|text|lyrics?)\s*\(/.test(code)) noun = 'Lyrics';
    else if (/\b(?:TextGeometry|fillText|troika|type\s*\(\s*P)\b/.test(code)) noun = 'Text';
    else if (/\bparticles\s*\(\s*P\b|\bPoints(?:Material)?\b|\bparticles?\b/i.test(words)) noun = 'Particles';
    else if (/(^|[^.\w])shader\s*\(|gl_FragColor|mainImage|fragmentShader/.test(code)) {
      modOk = false;
      noun = /gradient|liquid/i.test(raw) ? 'Gradient backdrop' : /plasma/i.test(raw) ? 'Plasma' : /tunnel/i.test(raw) ? 'Tunnel'
        : /raymarch|\bsdf\b|march\s*\(/i.test(raw) ? 'Raymarch' : /julia|mandel|fractal/i.test(raw) ? 'Fractal' : /marble/i.test(raw) ? 'Marble'
          : /spectrum|equali[sz]er/i.test(raw) ? 'Spectrum' : /\bfbm\b|noise/i.test(raw) ? 'Noise field' : 'Shader backdrop';
    } else {
      let best = null;
      for (const [g, one, many] of SHAPES) {
        const n = count(code, new RegExp(`\\b(?:THREE\\.)?${g}(?:Buffer)?Geometry\\b`, 'g'));
        if (n && (!best || n > best.n)) best = { n, one, many, g };
      }
      if (best && /\bblob\b/i.test(raw)) noun = 'Blob';
      else if (best) {
        const loop = new RegExp(`for\\s*\\([^)]*\\)[^\\n]*${best.g}(?:Buffer)?Geometry|InstancedMesh`).test(code);
        noun = best.n > 1 || loop ? best.many : best.one;
        if (best.g === 'Plane' && !loop && best.n === 1) noun = 'Backdrop';
      } else if (/\bLine(?:Segments|Loop)?\b|LineBasicMaterial/.test(code)) noun = 'Lines';
      else if (/scene\.background|setClearColor/.test(code)) { noun = 'Background'; modOk = false; }
      else if (/\bnew\s+(?:THREE\.)?(?:\w+)Light\b/.test(code)) { noun = 'Lights'; modOk = false; }
    }
    if (!noun) return null;
    if (!modOk) return noun;
    const music = MUSIC.map(([w, re]) => [w, count(words, re)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] || (count(code, BEAT) ? 'Beat' : null);
    if (music) return `${music} ${noun.toLowerCase()}`;
    if (count(words, GLOW) && noun !== 'Glow') return `Glow ${noun.toLowerCase()}`;
    return noun;
  }

  // the layers to name → [[id, new name]]: picked ids (else every generic one; all: every layer). Names stay unique.
  function plan(layers, { ids = null, all = false } = {}) {
    const want = ids?.length ? new Set(ids) : null;
    const list = (layers || []).filter((L) => (want ? want.has(L.id) : all || isGeneric(L.name)));
    const taken = new Set((layers || []).filter((L) => !list.includes(L)).map((L) => L.name.toLowerCase()));
    const out = [];
    for (const L of list) {
      let n = nameFor(L);
      if (!n) continue;
      n = n.slice(0, MAX);
      let k = n; let i = 2;
      while (taken.has(k.toLowerCase())) { k = `${n} ${i}`; i += 1; }
      taken.add(k.toLowerCase());
      if (k !== L.name) out.push([L.id, k]);
    }
    return out;
  }

  // ---------- ✦ the AI pass (only on a click, its cost shown first) ----------
  const PERSONA = 'You are a careful music-visuals assistant. Answer with JSON only.';
  const HEAD = '✦ Name these layers';
  const hint = (code) => strip(code).replace(/\s+/g, ' ').trim().slice(0, 220);
  function prompt(layers) {
    const lines = layers.map((L, i) => `${i + 1}. now "${L.name}"${L.group ? ` (group "${L.group}")` : ''}${L.sliders?.length ? ` · sliders: ${L.sliders.slice(0, 8).join(', ')}` : ''} · code: ${hint(L.code)}`);
    return `${HEAD}\nGive each layer of this music-visual scene a short plain name (1–3 words, like "Glow ring" or "Bass particles") that says what it shows. Answer with JSON only: {"names": ["…", …]}, one per layer, in this order.\n${lines.join('\n')}`;
  }
  // → [[id, name]] for the names that came back (same order; empty or odd ones skipped)
  function parse(text, layers) {
    let j = null;
    try { j = JSON.parse(String(text || '').replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '')); } catch { return []; }
    const arr = Array.isArray(j) ? j : Array.isArray(j?.names) ? j.names : [];
    return layers.map((L, i) => [L.id, String(arr[i] ?? '').replace(/[\u0000-\u001f"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX)]).filter(([, n]) => n);
  }
  const estimateCost = (p, n = 1) => ({ input: Math.round(700 + String(p || '').length / 3.6), output: 20 + n * 8 });
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude', model = '') => `About ${kfmt(c.input)} tokens in and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''} (the cheapest helper)`;

  return { isGeneric, nameFor, plan, prompt, parse, estimateCost, costLine, PERSONA, HEAD };
})();
if (typeof module !== 'undefined') module.exports = OutlineCore;
