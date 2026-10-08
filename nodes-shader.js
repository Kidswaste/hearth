// Shader nodes: GLSL fragment shaders as node graphs (nodes.js). One graph compiles to
//   · the shader playground (GLSL ES 3.0 with uTime / uResolution / uMouse; the music is simulated at 120 bpm),
//   · a Lab filter layer (filter.define + filter(): it restyles every layer below it, with the song's hits),
//   · a Lab layer of its own (a full-screen shader reacting to the music), a new Lab sketch, or Shadertoy.
// Knobs become uniforms: Lab sliders in Lab layers (Save, Shuffle, looks keep working), constants in the
// playground. The graph rides in the code's last line (// @nodes:v1 {…}), so NodeView.openCode reopens it.
// The editor is a dialog with a live preview (its own WebGL2 canvas, optionally a still of the Lab as the
// picture), and everything is drivable from chat: /shader-nodes, /shader-nodes-new <preset>, …
const ShaderNodes = (() => {
  const TYPES = {
    float: { color: '#48ddff', label: 'Number' },
    vec2: { color: '#bd8bff', label: 'Position (x, y)' },
    vec3: { color: '#7ad0ff', label: 'Vector (x, y, z)' },
    color: { color: '#ff6b9d', label: 'Color' },
  };
  const LUMA = 'vec3(0.299, 0.587, 0.114)';
  const frameOf = (node, graph) => (graph.frames || []).find((f) => node.x >= f.x && node.y >= f.y && node.x < f.x + f.w && node.y < f.y + f.h);
  const reg = NodeView.createRegistry({
    name: 'shader', types: TYPES, idBase: (d) => d.type, // short ids for chat: fbm1, palette2…
    compat: { float: ['vec2', 'vec3', 'color'], vec2: ['vec3', 'color'], vec3: ['color', 'vec2', 'float'], color: ['vec3', 'vec2', 'float'] },
    convert: (from, to, e) => {
      if (from === 'float') return to === 'vec2' ? `vec2(${e})` : `vec3(${e})`;
      if (from === 'vec2') return to === 'float' ? `(${e}).x` : `vec3(${e}, 0.0)`;
      if (to === 'vec2') return `(${e}).xy`;
      if (to === 'float') return `dot(${e}, ${LUMA})`;
      return e;
    },
    paramExpr: (key) => `u_${key}`,
    groupOf: (node, def, graph) => node.group || frameOf(node, graph)?.title || `Shader ${def.category}`,
    sliderLabel: 'Make it a slider (uniform)',
    sliderHint: 'A uniform: a Lab slider in Lab layers (Save, Shuffle), a constant in the playground. Off bakes the value into the code.',
    assemble: (parts) => core(parts),
  });

  // ---------- GLSL literals and field helpers ----------
  const lf = (v) => { const n = Number(v) || 0; let s = String(Math.round(n * 1e6) / 1e6); if (/e/i.test(s)) s = n.toFixed(6); if (!s.includes('.')) s += '.0'; return n < 0 ? `(${s})` : s; };
  const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const x = m ? parseInt(m[1], 16) : 0xffffff; return [(x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255]; };
  const vec3Lit = (h) => `vec3(${hexRgb(h).map((x) => lf(Math.round(x * 1000) / 1000)).join(', ')})`;
  const glType = (t) => (t === 'float' ? 'float' : t === 'vec2' ? 'vec2' : 'vec3');
  const N = (name, value, min, max, o = {}) => ({ name, type: 'float', kind: 'number', value, min, max, ...o });
  const C = (name, value, o = {}) => ({ name, type: 'color', value, ...o });
  const SEL = (name, options, o = {}) => ({ name, kind: 'select', options, value: o.value ?? options[0], slider: false, ...o });
  const UV = (name = 'uv', o = {}) => ({ name, type: 'vec2', kind: null, fallback: 'sgUV', label: 'UV', hint: 'Not connected: the screen (0..1)', ...o });
  const PC = (name = 'p', o = {}) => ({ name, type: 'vec2', kind: null, fallback: 'sgP', label: 'Position', hint: 'Not connected: the screen, centered (-1..1 high, aspect kept)', ...o });
  const SOCK = (name, type, fallback, o = {}) => ({ name, type, kind: null, fallback, ...o });
  const O = (name, type, label) => ({ name, type, ...(label ? { label } : {}) });

  // what a node's compile gets: inputs as GLSL expressions, helpers, temporaries
  function kit(c) {
    const f = (name) => c.def.fields.find((x) => x.name === name);
    const raw = (name) => {
      const e = c.in(name);
      if (c.linked(name) || /^u_/.test(e)) return e;
      const fl = f(name);
      if (!fl?.kind) return e; // a socket's fallback (sgUV, sgP, sgTime…)
      const v = c.value(name);
      if (fl.type === 'color' || (typeof v === 'string' && v.startsWith('#'))) return vec3Lit(v);
      if (fl.type === 'vec2' && Array.isArray(v)) return `vec2(${lf(v[0])}, ${lf(v[1])})`;
      if (typeof v === 'boolean') return v ? '1.0' : '0.0';
      return lf(v);
    };
    let n = 0;
    return {
      in: raw, f: raw, v2: raw, c3: raw,
      val: (name) => c.value(name),
      h: (key) => helper(c, key),
      // a temporary local: type name = expr; → its name
      tmp(type, expr, hint = 't') { n += 1; const v = `${c.id}_${hint}${n}`; c.frame(`${glType(type)} ${v} = ${expr};`); return v; },
      stmt: (s) => c.frame(s),
      shared: c.shared,
    };
  }
  // def({ …, glsl(c, x) → { output: expr } }): every output becomes a local variable, computed once
  function def(d) {
    return reg.define({
      ...d,
      compile: (c) => {
        const x = kit(c);
        const res = d.glsl(c, x) || {};
        const out = {};
        for (const o of reg.get(d.type).outputs) {
          if (res[o.name] == null) continue;
          const v = `${c.id}_${o.name}`;
          c.frame(`${glType(o.type)} ${v} = ${res[o.name]};`);
          out[o.name] = v;
        }
        return out;
      },
    });
  }

  // ---------- GLSL helper library (prefixed sg… so nothing clashes with the Lab's filter header) ----------
  const LIB = {
    sgHash: 'float sgHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    sgHash2: 'vec2 sgHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }',
    sgValue: ['sgHash', `float sgValue(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sgHash(i), sgHash(i + vec2(1.0, 0.0)), u.x), mix(sgHash(i + vec2(0.0, 1.0)), sgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`],
    sgSimplex: [`vec3 sgPermute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float sgSimplex(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = sgPermute(sgPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0); m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`],
    sgVoronoi: ['sgHash', 'sgHash2', `vec3 sgVoronoi(vec2 p, float t) {
  vec2 n = floor(p); vec2 f = fract(p);
  float d1 = 8.0; float d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = sgHash2(n + g); o = 0.5 + 0.5 * sin(t + 6.2831853 * o);
      vec2 r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), sgHash(id));
}`],
    // smoothstep that also works with the edges the other way round (GLSL leaves that undefined)
    sgSmooth: 'float sgSmooth(float e0, float e1, float x) { float d = e1 - e0; float t = clamp((x - e0) / (abs(d) < 1e-6 ? 1e-6 : d), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }',
    sgRot: 'vec2 sgRot(vec2 p, float a) { float s = sin(a); float c = cos(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }',
    sgHsv2rgb: 'vec3 sgHsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }',
    sgRgb2hsv: `vec3 sgRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`,
    sgHueShift: ['sgRgb2hsv', 'sgHsv2rgb', 'vec3 sgHueShift(vec3 c, float h) { vec3 k = sgRgb2hsv(c); k.x = fract(k.x + h); return sgHsv2rgb(k); }'],
    sgPal: 'vec3 sgPal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.2831853 * (c * t + d)); }',
    sgSmin: 'float sgSmin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }',
    sgNgon: 'float sgNgon(vec2 p, float r, float n) { float a = atan(p.x, p.y) + 3.14159265; float s = 6.2831853 / n; return cos(floor(0.5 + a / s) * s - a) * length(p) - r; }',
    sgStar: 'float sgStar(vec2 p, float r, float n, float inner) { float a = atan(p.y, p.x); float k = pow(0.5 + 0.5 * cos(a * n), 3.0); return length(p) - mix(r * inner, r, k); }',
    sgBox: 'float sgBox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }',
    sgHeart: `float sgHeart(vec2 p, float s) {
  p /= max(s, 1e-4); p.y += 0.6; p.x = abs(p.x);
  if (p.y + p.x > 1.0) return (sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0) * s;
  vec2 q1 = p - vec2(0.0, 1.0); vec2 q2 = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(q1, q1), dot(q2, q2))) * sign(p.x - p.y) * s;
}`,
    sgSegment: 'float sgSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }',
    sgAces: 'vec3 sgAces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
    sgWave: 'float sgWave(float x, float kind) { float f = fract(x); if (kind < 0.5) return 0.5 + 0.5 * sin(x * 6.2831853); if (kind < 1.5) return 1.0 - abs(f * 2.0 - 1.0); if (kind < 2.5) return f; return step(0.5, f); }',
    sgBlur: 'vec3 sgBlur(vec2 uv, float r) { vec2 e = r / sgRes; vec3 s = sgSource(uv) * 0.25; s += (sgSource(uv + vec2(e.x, 0.0)) + sgSource(uv - vec2(e.x, 0.0)) + sgSource(uv + vec2(0.0, e.y)) + sgSource(uv - vec2(0.0, e.y))) * 0.125; s += (sgSource(uv + e) + sgSource(uv - e) + sgSource(uv + vec2(e.x, -e.y)) + sgSource(uv + vec2(-e.x, e.y))) * 0.0625; return s; }',
    sgEdge: `float sgEdge(vec2 uv, float r) {
  vec2 e = r / sgRes;
  float tl = dot(sgSource(uv + vec2(-e.x, e.y)), ${LUMA}); float t = dot(sgSource(uv + vec2(0.0, e.y)), ${LUMA}); float tr = dot(sgSource(uv + e), ${LUMA});
  float l = dot(sgSource(uv - vec2(e.x, 0.0)), ${LUMA}); float rr = dot(sgSource(uv + vec2(e.x, 0.0)), ${LUMA});
  float bl = dot(sgSource(uv - e), ${LUMA}); float b = dot(sgSource(uv - vec2(0.0, e.y)), ${LUMA}); float br = dot(sgSource(uv + vec2(e.x, -e.y)), ${LUMA});
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br; float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}`,
  };
  // fbm with a fixed number of octaves (loops need a constant bound in GLSL ES 1.0)
  const fbmKey = (oct, base) => `sgFbm${base === 'simplex' ? 'S' : 'V'}${oct}`;
  function helper(c, key) {
    const m = /^sgFbm([SV])(\d)$/.exec(key);
    if (m) {
      const base = m[1] === 'S' ? 'sgSimplex' : 'sgValue';
      helper(c, base);
      const sample = m[1] === 'S' ? '(0.5 + 0.5 * sgSimplex(p))' : 'sgValue(p)';
      c.helper(key, `float ${key}(vec2 p, float lac, float gain) { float v = 0.0; float a = 0.5; float norm = 0.0; for (int i = 0; i < ${m[2]}; i++) { v += a * ${sample}; norm += a; p = p * lac + vec2(17.1, 9.3); a *= gain; } return v / norm; }`);
      return key;
    }
    const lib = LIB[key];
    if (!lib) throw new Error(`no helper ${key}`);
    const list = Array.isArray(lib) ? lib : [lib];
    for (const dep of list.slice(0, -1)) helper(c, dep);
    c.helper(key, list[list.length - 1]);
    return key;
  }

  // ---------- node types ----------
  const cat = (category, color) => (o) => def({ category, color, ...o });

  // Input
  const input = cat('Input', '#7ad0ff');
  input({ type: 'uv', title: 'UV', desc: 'Where this pixel is: uv 0..1, centered (-1..1 high, aspect kept), pixels', keywords: 'coordinates position screen fragcoord',
    outputs: [O('uv', 'vec2', 'UV 0..1'), O('centered', 'vec2', 'Centered'), O('pixel', 'vec2', 'Pixels')],
    glsl: () => ({ uv: 'sgUV', centered: 'sgP', pixel: 'sgUV * sgRes' }) });
  input({ type: 'polar', title: 'Polar', desc: 'Angle (0..1 around) and distance from the center', keywords: 'angle radius circle',
    inputs: [PC()], outputs: [O('angle', 'float'), O('radius', 'float'), O('polar', 'vec2', 'As UV')],
    glsl: (c, x) => { const p = x.in('p'); const a = `(atan(${p}.y, ${p}.x) / 6.2831853 + 0.5)`; return { angle: a, radius: `length(${p})`, polar: `vec2(${a}, length(${p}))` }; } });
  input({ type: 'time', title: 'Time', desc: 'Seconds (scaled by speed), and handy loops of it', keywords: 'clock animate seconds',
    inputs: [N('speed', 1, 0, 4)], outputs: [O('t', 'float', 'Time'), O('sin', 'float', 'Sine 0..1'), O('loop', 'float', 'Loop 0..1 (1 s)')],
    glsl: (c, x) => { const t = `(sgTime * ${x.f('speed')})`; return { t, sin: `(0.5 + 0.5 * sin(${t}))`, loop: `fract(${t})` }; } });
  input({ type: 'mouse', title: 'Mouse', desc: 'The pointer over the picture (the center in filter layers)', keywords: 'pointer cursor',
    outputs: [O('uv', 'vec2', 'UV 0..1'), O('centered', 'vec2', 'Centered')],
    glsl: () => ({ uv: 'sgMouse', centered: '((sgMouse - 0.5) * vec2(sgRes.x / sgRes.y, 1.0) * 2.0)' }) });
  input({ type: 'resolution', title: 'Resolution', desc: 'Picture size in pixels and its aspect (width / height)', keywords: 'size aspect',
    outputs: [O('size', 'vec2', 'Size'), O('aspect', 'float', 'Aspect')], glsl: () => ({ size: 'sgRes', aspect: '(sgRes.x / sgRes.y)' }) });
  input({ type: 'number', title: 'Number', desc: 'A number (a slider in the Lab)', keywords: 'value constant float slider',
    inputs: [N('value', 0.5, 0, 1)], outputs: [O('out', 'float', 'Value')], glsl: (c, x) => ({ out: x.f('value') }) });
  input({ type: 'color', title: 'Color', desc: 'A color (a color slider in the Lab)', keywords: 'rgb hex constant',
    inputs: [C('color', '#ff8c42')], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: x.c3('color') }) });
  input({ type: 'vec2', title: 'Position', desc: 'Two numbers (x, y) as a position or offset', keywords: 'vector xy point offset',
    inputs: [N('x', 0, -1, 1), N('y', 0, -1, 1)], outputs: [O('out', 'vec2', 'Position')], glsl: (c, x) => ({ out: `vec2(${x.f('x')}, ${x.f('y')})` }) });
  input({ type: 'frame-random', title: 'Random per pixel', desc: 'A random number for every pixel (changes every frame when animated)', keywords: 'hash noise dither',
    inputs: [UV(), N('animate', 1, 0, 1)], outputs: [O('out', 'float', 'Random')],
    glsl: (c, x) => { x.h('sgHash'); return { out: `sgHash(${x.in('uv')} * sgRes + floor(sgTime * 60.0) * ${x.f('animate')} * vec2(17.0, 31.0))` }; } });

  // Music
  const music = cat('Music', '#ff6b9d');
  const MUSIC = { kick: 'sgKick', snare: 'sgSnare', hats: 'sgHats', hit: 'sgHit', beat: 'sgBeat', bass: 'sgBass', level: 'sgLevel', drop: 'sgDrop' };
  music({ type: 'hits', title: 'Hits', desc: 'Kick, snare, hats and hit: 1 on the hit, fading (your markers or the ⚡ triggers in the Lab; simulated in the playground)', keywords: 'kick snare hats drum beat music audio',
    outputs: [O('kick', 'float', 'Kick'), O('snare', 'float', 'Snare'), O('hats', 'float', 'Hats'), O('hit', 'float', 'Hit')],
    glsl: () => ({ kick: 'sgKick', snare: 'sgSnare', hats: 'sgHats', hit: 'sgHit' }) });
  music({ type: 'levels', title: 'Music levels', desc: 'Bass and overall level (0..1) and the beat pulse', keywords: 'bass loudness volume audio band',
    outputs: [O('bass', 'float', 'Bass'), O('level', 'float', 'Level'), O('beat', 'float', 'Beat')], glsl: () => ({ bass: 'sgBass', level: 'sgLevel', beat: 'sgBeat' }) });
  music({ type: 'beat-phase', title: 'Beat phase', desc: 'Where we are in the beat (0..1 saw) and a pulse with your own sharpness', keywords: 'tempo bpm saw pulse',
    inputs: [N('sharpness', 6, 1, 20)], outputs: [O('phase', 'float', 'Phase 0..1'), O('pulse', 'float', 'Pulse')],
    glsl: (c, x) => ({ phase: 'sgBeatPhase', pulse: `exp(-sgBeatPhase * ${x.f('sharpness')})` }) });
  music({ type: 'drop', title: 'Drop', desc: '1 right after a drop (a loud part starting), fading', keywords: 'build drop section loud',
    outputs: [O('drop', 'float', 'Drop')], glsl: () => ({ drop: 'sgDrop' }) });
  music({ type: 'music-amount', title: 'Music → number', desc: 'One music value times an amount, plus a base: the quickest way to make anything react', keywords: 'react drive modulate audio',
    inputs: [SEL('source', Object.keys(MUSIC)), N('amount', 0.5, 0, 2), N('base', 0, -1, 1)], outputs: [O('out', 'float', 'Value')],
    glsl: (c, x) => ({ out: `(${x.f('base')} + ${MUSIC[x.val('source')] || 'sgKick'} * ${x.f('amount')})` }) });
  music({ type: 'hit-shape', title: 'Hit shape', desc: 'Sharpen or soften a hit (power curve) and hold it a little', keywords: 'envelope curve punch',
    inputs: [SOCK('hit', 'float', 'sgKick', { label: 'Hit' }), N('power', 2, 0.2, 8), N('gain', 1, 0, 3)], outputs: [O('out', 'float', 'Shaped')],
    glsl: (c, x) => ({ out: `(pow(clamp(${x.in('hit')}, 0.0, 1.0), ${x.f('power')}) * ${x.f('gain')})` }) });

  // Math
  const math = cat('Math', '#48ddff');
  const OPS = { add: (a, b) => `(${a} + ${b})`, subtract: (a, b) => `(${a} - ${b})`, multiply: (a, b) => `(${a} * ${b})`, divide: (a, b) => `(${a} / max(abs(${b}), 1e-5) * sign(${b} + 1e-9))`, min: (a, b) => `min(${a}, ${b})`, max: (a, b) => `max(${a}, ${b})`, power: (a, b) => `pow(abs(${a}), ${b})`, modulo: (a, b) => `mod(${a}, max(${b}, 1e-5))`, atan2: (a, b) => `atan(${a}, ${b})`, step: (a, b) => `step(${b}, ${a})` };
  math({ type: 'math', title: 'Math', desc: 'a (+ − × ÷ min max pow mod atan2 step) b', keywords: 'add multiply subtract divide arithmetic',
    inputs: [N('a', 0.5, -2, 2), N('b', 1, -2, 2), SEL('op', Object.keys(OPS), { value: 'multiply' })], outputs: [O('out', 'float', 'Result')],
    badge: (n) => ({ add: '+', subtract: '−', multiply: '×', divide: '÷', min: 'min', max: 'max', power: 'pow', modulo: 'mod', atan2: 'atan', step: 'step' }[n.values?.op || 'multiply']),
    glsl: (c, x) => ({ out: (OPS[x.val('op')] || OPS.multiply)(x.f('a'), x.f('b')) }) });
  const FNS = { sin: (a) => `sin(${a})`, cos: (a) => `cos(${a})`, tan: (a) => `tan(${a})`, abs: (a) => `abs(${a})`, floor: (a) => `floor(${a})`, ceil: (a) => `ceil(${a})`, fract: (a) => `fract(${a})`, sqrt: (a) => `sqrt(abs(${a}))`, exp: (a) => `exp(${a})`, log: (a) => `log(max(${a}, 1e-5))`, sign: (a) => `sign(${a})`, negate: (a) => `(-(${a}))`, 'one minus': (a) => `(1.0 - ${a})`, square: (a) => `(${a} * ${a})`, '0..1 → -1..1': (a) => `(${a} * 2.0 - 1.0)`, '-1..1 → 0..1': (a) => `(${a} * 0.5 + 0.5)` };
  math({ type: 'function', title: 'Function', desc: 'sin, cos, abs, floor, fract, sqrt, exp, log, one minus… of a number', keywords: 'sine cosine abs fract floor',
    inputs: [N('x', 0.5, -2, 2), SEL('fn', Object.keys(FNS))], outputs: [O('out', 'float', 'Result')], badge: (n) => n.values?.fn || 'sin',
    glsl: (c, x) => ({ out: (FNS[x.val('fn')] || FNS.sin)(x.f('x')) }) });
  math({ type: 'mix-num', title: 'Mix numbers', desc: 'Blend from a to b by t', keywords: 'lerp interpolate',
    inputs: [N('a', 0, -2, 2), N('b', 1, -2, 2), N('t', 0.5, 0, 1)], outputs: [O('out', 'float', 'Result')], glsl: (c, x) => ({ out: `mix(${x.f('a')}, ${x.f('b')}, ${x.f('t')})` }) });
  math({ type: 'remap', title: 'Remap', desc: 'Map a range to another (0..1 → 0.2..0.8)', keywords: 'range scale map fit',
    inputs: [N('x', 0.5, -2, 2), N('inMin', 0, -2, 2), N('inMax', 1, -2, 2), N('outMin', 0, -4, 4), N('outMax', 1, -4, 4)], outputs: [O('out', 'float', 'Result')],
    glsl: (c, x) => ({ out: `mix(${x.f('outMin')}, ${x.f('outMax')}, (${x.f('x')} - ${x.f('inMin')}) / max(${x.f('inMax')} - ${x.f('inMin')}, 1e-5))` }) });
  math({ type: 'clamp', title: 'Clamp', desc: 'Keep a number between min and max', keywords: 'limit saturate',
    inputs: [N('x', 0.5, -2, 2), N('min', 0, -2, 2), N('max', 1, -2, 2)], outputs: [O('out', 'float', 'Result')], glsl: (c, x) => ({ out: `clamp(${x.f('x')}, ${x.f('min')}, ${x.f('max')})` }) });
  math({ type: 'smoothstep', title: 'Smooth step', desc: '0 at edge 1, 1 at edge 2, smooth in between (edge 2 below edge 1 flips it)', keywords: 'threshold soft edge',
    inputs: [N('x', 0.5, -2, 2), N('edge0', 0.3, -2, 2, { label: 'Edge 1' }), N('edge1', 0.7, -2, 2, { label: 'Edge 2' })], outputs: [O('out', 'float', 'Result')],
    glsl: (c, x) => { x.h('sgSmooth'); return { out: `sgSmooth(${x.f('edge0')}, ${x.f('edge1')}, ${x.f('x')})` }; } });
  math({ type: 'step', title: 'Threshold', desc: '1 when x is above the edge, else 0', keywords: 'step hard edge cut',
    inputs: [N('x', 0.5, -2, 2), N('edge', 0.5, -2, 2)], outputs: [O('out', 'float', 'Result')], glsl: (c, x) => ({ out: `step(${x.f('edge')}, ${x.f('x')})` }) });
  math({ type: 'oscillator', title: 'Oscillator', desc: 'A wave (sine, triangle, saw, square) over time or any input', keywords: 'lfo wave sine saw triangle square',
    inputs: [SOCK('x', 'float', 'sgTime', { label: 'Input (time)' }), N('freq', 1, 0, 10, { label: 'Frequency' }), N('phase', 0, 0, 1), SEL('wave', ['sine', 'triangle', 'saw', 'square'])], outputs: [O('out', 'float', 'Wave 0..1')],
    badge: (n) => n.values?.wave || 'sine',
    glsl: (c, x) => { x.h('sgWave'); return { out: `sgWave(${x.in('x')} * ${x.f('freq')} + ${x.f('phase')}, ${lf(['sine', 'triangle', 'saw', 'square'].indexOf(x.val('wave')))})` }; } });
  math({ type: 'shape-curve', title: 'Curve', desc: 'Bend a 0..1 value: power, smooth, gain (S-curve) or bias', keywords: 'ease gamma bias gain',
    inputs: [N('x', 0.5, 0, 1), N('amount', 2, 0.1, 8), SEL('curve', ['power', 'smooth', 'gain', 'bias'])], outputs: [O('out', 'float', 'Result')],
    glsl: (c, x) => {
      const v = `clamp(${x.f('x')}, 0.0, 1.0)`; const k = x.f('amount');
      const e = { power: `pow(${v}, ${k})`, smooth: `(${v} * ${v} * (3.0 - 2.0 * ${v}))`, gain: `(${v} < 0.5 ? 0.5 * pow(2.0 * ${v}, ${k}) : 1.0 - 0.5 * pow(2.0 - 2.0 * ${v}, ${k}))`, bias: `(${v} / ((1.0 / max(${k}, 1e-3) - 2.0) * (1.0 - ${v}) + 1.0))` }[x.val('curve')];
      return { out: e };
    } });
  math({ type: 'quantize', title: 'Steps', desc: 'Snap a number to steps (posterize a value)', keywords: 'quantize snap round',
    inputs: [N('x', 0.5, -2, 2), N('steps', 4, 1, 32, { step: 1 })], outputs: [O('out', 'float', 'Result')], glsl: (c, x) => ({ out: `(floor(${x.f('x')} * ${x.f('steps')}) / ${x.f('steps')})` }) });
  math({ type: 'length', title: 'Distance', desc: 'Distance of a position from a point (the center by default)', keywords: 'length radius distance',
    inputs: [PC(), SOCK('to', 'vec2', 'vec2(0.0)', { label: 'From point' })], outputs: [O('out', 'float', 'Distance')], glsl: (c, x) => ({ out: `length(${x.in('p')} - ${x.in('to')})` }) });
  math({ type: 'split', title: 'Split position', desc: 'x and y of a position', keywords: 'separate xy components',
    inputs: [SOCK('v', 'vec2', 'sgUV', { label: 'Position' })], outputs: [O('x', 'float', 'X'), O('y', 'float', 'Y')], glsl: (c, x) => ({ x: `${x.in('v')}.x`, y: `${x.in('v')}.y` }) });
  math({ type: 'combine', title: 'Make position', desc: 'A position from two numbers', keywords: 'combine join xy',
    inputs: [N('x', 0, -2, 2), N('y', 0, -2, 2)], outputs: [O('out', 'vec2', 'Position')], glsl: (c, x) => ({ out: `vec2(${x.f('x')}, ${x.f('y')})` }) });
  math({ type: 'vec-math', title: 'Position math', desc: 'Add, subtract, multiply or scale positions', keywords: 'vector offset scale',
    inputs: [SOCK('a', 'vec2', 'sgP', { label: 'A' }), SOCK('b', 'vec2', 'vec2(0.0)', { label: 'B' }), N('scale', 1, -4, 4), SEL('op', ['add', 'subtract', 'multiply', 'scale'])], outputs: [O('out', 'vec2', 'Result')],
    glsl: (c, x) => { const a = x.in('a'); const b = x.in('b'); return { out: { add: `(${a} + ${b}) * ${x.f('scale')}`, subtract: `(${a} - ${b}) * ${x.f('scale')}`, multiply: `(${a} * ${b}) * ${x.f('scale')}`, scale: `${a} * ${x.f('scale')}` }[x.val('op')] }; } });
  math({ type: 'random', title: 'Random (hash)', desc: 'A steady random number from a position (same in, same out)', keywords: 'hash noise cell id',
    inputs: [SOCK('v', 'vec2', 'sgUV', { label: 'Position' }), N('scale', 1, 0, 100)], outputs: [O('out', 'float', 'Random 0..1')],
    glsl: (c, x) => { x.h('sgHash'); return { out: `sgHash(${x.in('v')} * ${x.f('scale')})` }; } });
  math({ type: 'expression', title: 'Expression', desc: 'Your own GLSL for a number, with a, b, uv, p and t (time). e.g. sin(p.x * 10.0 + t) * a', keywords: 'custom formula code glsl',
    inputs: [N('a', 1, -4, 4), N('b', 0, -4, 4)], widgets: [{ name: 'expr', kind: 'text', label: 'f =', value: 'sin(p.x * 10.0 + t) * a + b' }], outputs: [O('out', 'float', 'Result')],
    glsl: (c, x) => {
      const src = String(x.val('expr') || '0.0').replace(/[;{}]/g, '');
      const a = x.tmp('float', x.f('a'), 'a'); const b = x.tmp('float', x.f('b'), 'b');
      return { out: `(${src.replace(/\ba\b/g, a).replace(/\bb\b/g, b).replace(/\buv\b/g, 'sgUV').replace(/\bp\b/g, 'sgP').replace(/\bt\b/g, 'sgTime')})` };
    } });

  // UV / distort: everything here moves *where* the next nodes look
  const uvn = cat('UV & distort', '#bd8bff');
  uvn({ type: 'transform', title: 'Move · scale · rotate', desc: 'Offset, zoom and turn a position (around the center)', keywords: 'translate scale rotate transform uv',
    inputs: [PC(), N('x', 0, -2, 2, { label: 'Move x' }), N('y', 0, -2, 2, { label: 'Move y' }), N('scale', 1, 0.05, 8, { label: 'Zoom' }), N('angle', 0, -180, 180, { label: 'Rotate °' }), N('spin', 0, -2, 2, { label: 'Spin / s' })], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => { x.h('sgRot'); return { out: `sgRot((${x.in('p')} - vec2(${x.f('x')}, ${x.f('y')})) / max(${x.f('scale')}, 1e-3), -(${x.f('angle')} * 0.0174533 + sgTime * ${x.f('spin')} * 6.2831853))` }; } });
  uvn({ type: 'tile', title: 'Tile', desc: 'Repeat the picture in a grid (each tile 0..1) and give each tile an id', keywords: 'repeat grid fract',
    inputs: [UV(), N('x', 4, 1, 32, { label: 'Across' }), N('y', 4, 1, 32, { label: 'Down' })], outputs: [O('uv', 'vec2', 'Tile UV'), O('id', 'vec2', 'Tile id'), O('centered', 'vec2', 'Tile centered')],
    glsl: (c, x) => { const s = x.tmp('vec2', `${x.in('uv')} * vec2(${x.f('x')}, ${x.f('y')})`, 's'); return { uv: `fract(${s})`, id: `floor(${s})`, centered: `(fract(${s}) - 0.5) * 2.0` }; } });
  uvn({ type: 'mirror', title: 'Mirror', desc: 'Fold the picture onto itself (left / right, up / down, both)', keywords: 'symmetry reflect flip',
    inputs: [PC(), SEL('axis', ['left-right', 'up-down', 'both', 'diagonal'])], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => { const p = x.in('p'); return { out: { 'left-right': `vec2(abs(${p}.x), ${p}.y)`, 'up-down': `vec2(${p}.x, abs(${p}.y))`, both: `abs(${p})`, diagonal: `(${p}.x > ${p}.y ? ${p}.yx : ${p})` }[x.val('axis')] }; } });
  uvn({ type: 'kaleido', title: 'Kaleidoscope', desc: 'Mirror the picture around the center into slices', keywords: 'mandala symmetry slices',
    inputs: [PC(), N('segments', 6, 2, 24, { step: 1 }), N('spin', 0.05, -1, 1, { label: 'Spin / s' })], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => {
      const p = x.in('p');
      const s = x.tmp('float', `6.2831853 / max(${x.f('segments')}, 1.0)`, 's');
      const a = x.tmp('float', `atan(${p}.y, ${p}.x) + sgTime * ${x.f('spin')} * 6.2831853`, 'a');
      const m = x.tmp('float', `abs(mod(${a}, ${s}) - ${s} * 0.5)`, 'm');
      return { out: `vec2(cos(${m}), sin(${m})) * length(${p})` };
    } });
  uvn({ type: 'twirl', title: 'Twirl', desc: 'Swirl the middle around (more near the center)', keywords: 'swirl vortex twist',
    inputs: [PC(), N('strength', 2, -10, 10), N('radius', 1, 0.05, 3)], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => { x.h('sgRot'); const p = x.in('p'); return { out: `sgRot(${p}, ${x.f('strength')} * max(0.0, 1.0 - length(${p}) / ${x.f('radius')}))` }; } });
  uvn({ type: 'wave-warp', title: 'Wave warp', desc: 'Push the picture sideways in moving waves', keywords: 'wobble wave distort sine',
    inputs: [PC(), N('amount', 0.08, 0, 1), N('freq', 6, 0, 40, { label: 'Waves' }), N('speed', 1.5, -10, 10), SEL('axis', ['x', 'y', 'both'])], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => {
      const p = x.in('p'); const a = x.f('amount'); const f = x.f('freq'); const s = x.f('speed');
      const wx = `sin(${p}.y * ${f} + sgTime * ${s}) * ${a}`; const wy = `sin(${p}.x * ${f} + sgTime * ${s} * 1.3) * ${a}`;
      return { out: { x: `${p} + vec2(${wx}, 0.0)`, y: `${p} + vec2(0.0, ${wy})`, both: `${p} + vec2(${wx}, ${wy})` }[x.val('axis')] };
    } });
  uvn({ type: 'noise-warp', title: 'Noise warp', desc: 'Bend the picture along flowing noise (domain warp: liquid, smoke)', keywords: 'domain warp liquid flow distort',
    inputs: [PC(), N('amount', 0.4, 0, 3), N('scale', 2, 0.1, 12), N('speed', 0.2, 0, 3)], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => {
      x.h('sgValue');
      const p = x.in('p'); const sc = x.f('scale'); const t = `sgTime * ${x.f('speed')}`;
      const q = x.tmp('vec2', `vec2(sgValue(${p} * ${sc} + vec2(0.0, ${t})), sgValue(${p} * ${sc} + vec2(5.2, 1.3) - ${t}))`, 'q');
      return { out: `${p} + (${q} - 0.5) * 2.0 * ${x.f('amount')}` };
    } });
  uvn({ type: 'to-polar', title: 'Polar UV', desc: 'Unroll the circle: x = angle around, y = distance (tunnels, rings)', keywords: 'polar tunnel circular',
    inputs: [PC(), N('twist', 0, -4, 4), N('zoom', 1, 0.1, 8, { label: 'Depth' })], outputs: [O('out', 'vec2', 'Polar UV'), O('tunnel', 'vec2', 'Tunnel UV')],
    glsl: (c, x) => {
      const p = x.in('p');
      const a = x.tmp('float', `atan(${p}.y, ${p}.x) / 6.2831853 + 0.5`, 'a'); const r = x.tmp('float', `length(${p})`, 'r');
      return { out: `vec2(${a} + ${r} * ${x.f('twist')}, ${r} * ${x.f('zoom')})`, tunnel: `vec2(${a} + ${x.f('twist')} * 0.1 / max(${r}, 0.05), ${x.f('zoom')} * 0.3 / max(${r}, 0.02))` };
    } });
  uvn({ type: 'pixelate', title: 'Pixelate', desc: 'Snap positions to big pixels', keywords: 'mosaic blocks low-res',
    inputs: [UV(), N('cells', 64, 2, 400)], outputs: [O('out', 'vec2', 'UV')],
    glsl: (c, x) => { const n = x.tmp('vec2', `vec2(${x.f('cells')} * sgRes.x / sgRes.y, ${x.f('cells')})`, 'n'); return { out: `(floor(${x.in('uv')} * ${n}) + 0.5) / ${n}` }; } });
  uvn({ type: 'zoom-pulse', title: 'Zoom pulse', desc: 'Zoom in on a hit (or any value), around the center', keywords: 'punch bounce scale kick',
    inputs: [UV(), SOCK('amount', 'float', 'sgKick', { label: 'Pulse (kick)' }), N('strength', 0.15, -1, 1)], outputs: [O('out', 'vec2', 'UV')],
    glsl: (c, x) => ({ out: `(${x.in('uv')} - 0.5) / (1.0 + ${x.in('amount')} * ${x.f('strength')}) + 0.5` }) });
  uvn({ type: 'bulge', title: 'Bulge · pinch', desc: 'Fisheye bulge (positive) or pinch (negative) around the center', keywords: 'fisheye lens barrel pinch',
    inputs: [PC(), N('strength', 0.5, -1, 2)], outputs: [O('out', 'vec2', 'Position')],
    glsl: (c, x) => { const p = x.in('p'); return { out: `${p} * pow(max(length(${p}), 1e-4), ${x.f('strength')})` }; } });
  uvn({ type: 'ripple', title: 'Ripple', desc: 'Rings travelling out from the center bend the picture', keywords: 'water pond rings',
    inputs: [PC(), N('amount', 0.03, 0, 0.3), N('freq', 24, 1, 80, { label: 'Rings' }), N('speed', 4, -20, 20)], outputs: [O('out', 'vec2', 'Position'), O('rings', 'float', 'Rings 0..1')],
    glsl: (c, x) => {
      const p = x.in('p'); const r = x.tmp('float', `length(${p})`, 'r');
      const w = x.tmp('float', `sin(${r} * ${x.f('freq')} - sgTime * ${x.f('speed')})`, 'w');
      return { out: `${p} + normalize(${p} + 1e-5) * ${w} * ${x.f('amount')}`, rings: `(0.5 + 0.5 * ${w})` };
    } });
  uvn({ type: 'uv-from-centered', title: 'Centered → UV', desc: 'Turn a centered position back into 0..1 UV (to sample the picture)', keywords: 'convert screen',
    inputs: [PC()], outputs: [O('out', 'vec2', 'UV')], glsl: (c, x) => ({ out: `${x.in('p')} / vec2(sgRes.x / sgRes.y, 1.0) * 0.5 + 0.5` }) });

  // Noise
  const noise = cat('Noise', '#7cd992');
  noise({ type: 'value-noise', title: 'Value noise', desc: 'Soft blobby noise 0..1', keywords: 'noise random smooth',
    inputs: [PC(), N('scale', 4, 0.1, 40), N('speed', 0.3, -4, 4)], outputs: [O('out', 'float', 'Noise')],
    glsl: (c, x) => { x.h('sgValue'); return { out: `sgValue(${x.in('p')} * ${x.f('scale')} + vec2(sgTime * ${x.f('speed')}, 0.0))` }; } });
  noise({ type: 'simplex', title: 'Simplex noise', desc: 'Smooth organic noise 0..1 (fewer grid artifacts)', keywords: 'perlin gradient noise',
    inputs: [PC(), N('scale', 3, 0.1, 40), N('speed', 0.3, -4, 4)], outputs: [O('out', 'float', 'Noise')],
    glsl: (c, x) => { x.h('sgSimplex'); return { out: `(0.5 + 0.5 * sgSimplex(${x.in('p')} * ${x.f('scale')} + vec2(0.0, sgTime * ${x.f('speed')})))` }; } });
  noise({ type: 'fbm', title: 'Fractal noise (fbm)', desc: 'Layers of noise: clouds, smoke, terrain', keywords: 'fbm clouds octaves fractal brownian',
    inputs: [PC(), N('scale', 3, 0.1, 30), N('speed', 0.15, -4, 4), N('lacunarity', 2, 1.2, 4, { label: 'Detail size' }), N('gain', 0.5, 0.1, 0.9, { label: 'Detail strength' }), SEL('octaves', ['3', '4', '5', '6', '7'], { value: '5' }), SEL('base', ['value', 'simplex'])],
    outputs: [O('out', 'float', 'Noise')], badge: (n) => `${n.values?.octaves || 5} oct`,
    glsl: (c, x) => { const k = x.h(fbmKey(x.val('octaves'), x.val('base'))); return { out: `${k}(${x.in('p')} * ${x.f('scale')} + vec2(sgTime * ${x.f('speed')}, sgTime * ${x.f('speed')} * 0.6), ${x.f('lacunarity')}, ${x.f('gain')})` }; } });
  noise({ type: 'voronoi', title: 'Voronoi cells', desc: 'Cells: distance to the nearest point, cell edges and a random id per cell', keywords: 'worley cellular cells crackle',
    inputs: [PC(), N('scale', 5, 0.5, 40), N('speed', 1, 0, 6, { label: 'Wobble' })], outputs: [O('dist', 'float', 'Distance'), O('edge', 'float', 'Edges'), O('id', 'float', 'Cell id')],
    glsl: (c, x) => { x.h('sgVoronoi'); const v = x.tmp('vec3', `sgVoronoi(${x.in('p')} * ${x.f('scale')}, sgTime * ${x.f('speed')})`, 'v'); return { dist: `${v}.x`, edge: `${v}.y`, id: `${v}.z` }; } });
  noise({ type: 'ridged', title: 'Ridged noise', desc: 'Sharp ridges (lightning, mountains, veins)', keywords: 'ridge veins lightning marble',
    inputs: [PC(), N('scale', 3, 0.1, 30), N('speed', 0.2, -4, 4), N('sharpness', 2, 0.5, 6)], outputs: [O('out', 'float', 'Noise')],
    glsl: (c, x) => { x.h('sgSimplex'); return { out: `pow(1.0 - abs(sgSimplex(${x.in('p')} * ${x.f('scale')} + vec2(sgTime * ${x.f('speed')}))), ${x.f('sharpness')})` }; } });
  noise({ type: 'turbulence', title: 'Turbulence', desc: 'Folded fractal noise: fire, marble, energy', keywords: 'fire marble plasma turbulence',
    inputs: [PC(), N('scale', 2.5, 0.1, 30), N('speed', 0.3, -4, 4)], outputs: [O('out', 'float', 'Noise')],
    glsl: (c, x) => { x.h('sgSimplex'); const p = x.tmp('vec2', `${x.in('p')} * ${x.f('scale')} + vec2(0.0, sgTime * ${x.f('speed')})`, 'p'); return { out: `clamp(abs(sgSimplex(${p})) * 0.6 + abs(sgSimplex(${p} * 2.0)) * 0.3 + abs(sgSimplex(${p} * 4.0)) * 0.15, 0.0, 1.0)` }; } });
  noise({ type: 'grain', title: 'Grain', desc: 'Animated film grain / static', keywords: 'film grain static noise dither',
    inputs: [UV(), N('amount', 0.12, 0, 1), N('size', 1.5, 1, 8)], outputs: [O('out', 'float', 'Grain -..+')],
    glsl: (c, x) => { x.h('sgHash'); return { out: `(sgHash(floor(${x.in('uv')} * sgRes / ${x.f('size')}) + fract(sgTime * 7.31) * 91.7) - 0.5) * ${x.f('amount')}` }; } });

  // Shapes (signed distances: negative inside, 0 on the edge) and patterns
  const shape = cat('Shapes', '#ffd75e');
  shape({ type: 'circle', title: 'Circle', desc: 'Signed distance to a circle (feed Fill or Glow to see it)', keywords: 'sdf disc round',
    inputs: [PC(), N('radius', 0.5, 0, 2)], outputs: [O('d', 'float', 'Distance')], glsl: (c, x) => ({ d: `(length(${x.in('p')}) - ${x.f('radius')})` }) });
  shape({ type: 'ring', title: 'Ring', desc: 'Signed distance to a ring', keywords: 'sdf annulus circle outline',
    inputs: [PC(), N('radius', 0.6, 0, 2), N('width', 0.05, 0, 1)], outputs: [O('d', 'float', 'Distance')], glsl: (c, x) => ({ d: `(abs(length(${x.in('p')}) - ${x.f('radius')}) - ${x.f('width')})` }) });
  shape({ type: 'box', title: 'Box', desc: 'Signed distance to a (rounded) rectangle', keywords: 'sdf rectangle square rounded',
    inputs: [PC(), N('width', 0.6, 0, 2), N('height', 0.4, 0, 2), N('round', 0.05, 0, 1)], outputs: [O('d', 'float', 'Distance')],
    glsl: (c, x) => { x.h('sgBox'); return { d: `sgBox(${x.in('p')}, vec2(${x.f('width')}, ${x.f('height')}), ${x.f('round')})` }; } });
  shape({ type: 'polygon', title: 'Polygon', desc: 'Triangle, square, hexagon… (any number of sides)', keywords: 'sdf triangle hexagon ngon',
    inputs: [PC(), N('sides', 6, 3, 12, { step: 1 }), N('radius', 0.5, 0, 2)], outputs: [O('d', 'float', 'Distance')],
    glsl: (c, x) => { x.h('sgNgon'); return { d: `sgNgon(${x.in('p')}, ${x.f('radius')}, floor(${x.f('sides')}))` }; } });
  shape({ type: 'star', title: 'Star', desc: 'A star with any number of points', keywords: 'sdf star burst',
    inputs: [PC(), N('points', 5, 2, 16, { step: 1 }), N('radius', 0.6, 0, 2), N('inner', 0.45, 0.05, 1)], outputs: [O('d', 'float', 'Distance')],
    glsl: (c, x) => { x.h('sgStar'); return { d: `sgStar(${x.in('p')}, ${x.f('radius')}, floor(${x.f('points')}), ${x.f('inner')})` }; } });
  shape({ type: 'heart', title: 'Heart', desc: 'A heart shape', keywords: 'sdf love',
    inputs: [PC(), N('size', 0.7, 0.05, 2)], outputs: [O('d', 'float', 'Distance')], glsl: (c, x) => { x.h('sgHeart'); return { d: `sgHeart(${x.in('p')}, ${x.f('size')})` }; } });
  shape({ type: 'line', title: 'Line', desc: 'Distance to a line between two points', keywords: 'sdf segment stroke',
    inputs: [PC(), SOCK('a', 'vec2', 'vec2(-0.6, 0.0)', { label: 'From' }), SOCK('b', 'vec2', 'vec2(0.6, 0.0)', { label: 'To' }), N('width', 0.02, 0, 0.5)], outputs: [O('d', 'float', 'Distance')],
    glsl: (c, x) => { x.h('sgSegment'); return { d: `(sgSegment(${x.in('p')}, ${x.in('a')}, ${x.in('b')}) - ${x.f('width')})` }; } });
  shape({ type: 'combine-sdf', title: 'Combine shapes', desc: 'Union, smooth blend, cut out or overlap of two shapes', keywords: 'sdf union subtract intersect smooth min boolean',
    inputs: [SOCK('a', 'float', '1.0', { label: 'Shape A' }), SOCK('b', 'float', '1.0', { label: 'Shape B' }), N('smooth', 0.1, 0, 1), SEL('op', ['smooth union', 'union', 'cut out', 'overlap'])], outputs: [O('d', 'float', 'Distance')],
    badge: (n) => n.values?.op || 'smooth union',
    glsl: (c, x) => { const a = x.in('a'); const b = x.in('b'); const op = x.val('op'); if (op === 'smooth union') x.h('sgSmin'); return { d: { 'smooth union': `sgSmin(${a}, ${b}, ${x.f('smooth')})`, union: `min(${a}, ${b})`, 'cut out': `max(${a}, -(${b}))`, overlap: `max(${a}, ${b})` }[op] }; } });
  shape({ type: 'fill', title: 'Fill', desc: 'A shape\'s distance → a soft mask (1 inside, 0 outside)', keywords: 'mask solid antialias',
    inputs: [SOCK('d', 'float', '1.0', { label: 'Shape' }), N('softness', 0.01, 0, 0.5), N('grow', 0, -1, 1)], widgets: [{ name: 'invert', kind: 'toggle', type: 'bool', value: false, slider: false }], outputs: [O('mask', 'float', 'Mask')],
    glsl: (c, x) => { const m = `(1.0 - smoothstep(-${x.f('softness')} - 0.001, ${x.f('softness')} + 0.001, ${x.in('d')} - ${x.f('grow')}))`; return { mask: x.val('invert') ? `(1.0 - ${m})` : m }; } });
  shape({ type: 'glow', title: 'Glow · outline', desc: 'A shape\'s distance → a glowing outline (neon)', keywords: 'neon outline stroke halo',
    inputs: [SOCK('d', 'float', '1.0', { label: 'Shape' }), N('width', 0.01, 0, 0.3), N('glow', 0.02, 0.001, 0.3), N('strength', 1, 0, 4)], outputs: [O('out', 'float', 'Glow')],
    glsl: (c, x) => ({ out: `(${x.f('glow')} / max(abs(${x.in('d')}) - ${x.f('width')}, 0.002) * ${x.f('strength')})` }) });
  shape({ type: 'stripes', title: 'Stripes', desc: 'Moving stripes 0..1 at any angle', keywords: 'lines bars pattern',
    inputs: [PC(), N('count', 10, 1, 100), N('angle', 0, -180, 180, { label: 'Angle °' }), N('speed', 0.5, -5, 5), N('sharpness', 0.5, 0, 1)], outputs: [O('out', 'float', 'Stripes')],
    glsl: (c, x) => {
      const p = x.in('p'); const a = x.tmp('float', `${x.f('angle')} * 0.0174533`, 'a');
      const s = x.tmp('float', `0.5 + 0.5 * sin((dot(${p}, vec2(cos(${a}), sin(${a}))) * ${x.f('count')} + sgTime * ${x.f('speed')}) * 3.14159265)`, 's');
      return { out: `mix(${s}, step(0.5, ${s}), ${x.f('sharpness')})` };
    } });
  shape({ type: 'checker', title: 'Checker', desc: 'Checkerboard 0 / 1', keywords: 'chess grid pattern',
    inputs: [PC(), N('count', 8, 1, 64)], outputs: [O('out', 'float', 'Checker')],
    glsl: (c, x) => { const q = x.tmp('vec2', `floor(${x.in('p')} * ${x.f('count')} * 0.5)`, 'q'); return { out: `mod(${q}.x + ${q}.y, 2.0)` }; } });
  shape({ type: 'grid', title: 'Grid lines', desc: 'Thin grid lines (retro floors, blueprints)', keywords: 'lines grid blueprint tron',
    inputs: [PC(), N('count', 10, 1, 80), N('width', 0.04, 0.005, 0.5)], outputs: [O('out', 'float', 'Lines')],
    glsl: (c, x) => { const g = x.tmp('vec2', `abs(fract(${x.in('p')} * ${x.f('count')} * 0.5) - 0.5)`, 'g'); return { out: `1.0 - smoothstep(0.0, ${x.f('width')}, min(${g}.x, ${g}.y))` }; } });
  shape({ type: 'dots', title: 'Dot grid', desc: 'A grid of round dots (halftone, LED walls)', keywords: 'halftone led dots pattern',
    inputs: [PC(), N('count', 16, 1, 120), N('size', 0.35, 0, 0.7)], outputs: [O('out', 'float', 'Dots'), O('cell', 'vec2', 'Cell id')],
    glsl: (c, x) => { const s = x.tmp('vec2', `${x.in('p')} * ${x.f('count')} * 0.5`, 's'); return { out: `1.0 - smoothstep(${x.f('size')} - 0.06, ${x.f('size')}, length(fract(${s}) - 0.5))`, cell: `floor(${s})` }; } });
  shape({ type: 'gradient', title: 'Gradient', desc: 'A 0..1 ramp: linear, radial, angular or diamond', keywords: 'ramp linear radial',
    inputs: [PC(), N('angle', 90, -180, 180, { label: 'Angle °' }), SEL('kind', ['linear', 'radial', 'angular', 'diamond'])], outputs: [O('out', 'float', 'Ramp 0..1')],
    glsl: (c, x) => { const p = x.in('p'); const a = x.tmp('float', `${x.f('angle')} * 0.0174533`, 'a'); return { out: { linear: `clamp(dot(${p}, vec2(cos(${a}), sin(${a}))) * 0.5 + 0.5, 0.0, 1.0)`, radial: `clamp(length(${p}), 0.0, 1.0)`, angular: `(atan(${p}.y, ${p}.x) / 6.2831853 + 0.5)`, diamond: `clamp(abs(${p}.x) + abs(${p}.y), 0.0, 1.0)` }[x.val('kind')] }; } });

  // Color
  const color = cat('Color', '#ff8c42');
  const PALETTES = {
    rainbow: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0, 0.33, 0.67]],
    sunset: [[0.5, 0.3, 0.3], [0.5, 0.4, 0.3], [1, 1, 0.5], [0.8, 0.9, 0.3]],
    ocean: [[0.2, 0.5, 0.6], [0.2, 0.4, 0.4], [1, 1, 1], [0, 0.1, 0.2]],
    neon: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [2, 1, 0], [0.5, 0.2, 0.25]],
    fire: [[0.5, 0.25, 0.1], [0.5, 0.35, 0.1], [1, 1, 1], [0, 0.1, 0.2]],
    ice: [[0.6, 0.75, 0.9], [0.25, 0.25, 0.2], [1, 1, 1], [0.3, 0.2, 0.2]],
    vapor: [[0.6, 0.4, 0.7], [0.4, 0.3, 0.3], [1, 1, 1], [0.6, 0.85, 0.2]],
    forgeheart: [[0.55, 0.35, 0.2], [0.45, 0.35, 0.25], [1, 1, 1], [0, 0.12, 0.3]],
    acid: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 0.7, 0.4], [0, 0.15, 0.2]],
    candy: [[0.8, 0.5, 0.4], [0.2, 0.4, 0.2], [2, 1, 1], [0, 0.25, 0.25]],
  };
  const v3 = (a) => `vec3(${a.map(lf).join(', ')})`;
  color({ type: 'palette', title: 'Palette', desc: 'A smooth looping palette from a number (cosine palettes: rainbow, sunset, neon, fire…)', keywords: 'palette cosine gradient iq colors',
    inputs: [N('t', 0.5, 0, 1), N('offset', 0, 0, 1), N('cycle', 0.1, -2, 2, { label: 'Cycle / s' }), SEL('palette', Object.keys(PALETTES))], outputs: [O('out', 'color', 'Color')], badge: (n) => n.values?.palette || 'rainbow',
    glsl: (c, x) => { x.h('sgPal'); const p = PALETTES[x.val('palette')] || PALETTES.rainbow; return { out: `sgPal(${x.f('t')} + ${x.f('offset')} + sgTime * ${x.f('cycle')}, ${v3(p[0])}, ${v3(p[1])}, ${v3(p[2])}, ${v3(p[3])})` }; } });
  color({ type: 'ramp', title: 'Color ramp', desc: 'Your own gradient: a number 0..1 picks a color along it (click a swatch to change it, ＋ adds one)', keywords: 'gradient map colors stops lut',
    inputs: [N('t', 0.5, 0, 1)], widgets: [{ name: 'colors', kind: 'gradient', label: '', value: ['#0b0221', '#7b2ff7', '#f107a3', '#ffd75e'] }, SEL('mode', ['smooth', 'steps'])], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => {
      const cols = (Array.isArray(x.val('colors')) && x.val('colors').length >= 2 ? x.val('colors') : ['#000000', '#ffffff']).slice(0, 8);
      const t = x.tmp('float', `clamp(${x.f('t')}, 0.0, 1.0) * ${lf(cols.length - 1)}`, 't');
      if (x.val('mode') === 'steps') {
        let e = vec3Lit(cols[0]);
        cols.slice(1).forEach((col, i) => { e = `mix(${e}, ${vec3Lit(col)}, step(${lf(i + 0.5)}, ${t}))`; });
        return { out: e };
      }
      let e = vec3Lit(cols[0]);
      cols.slice(1).forEach((col, i) => { e = `mix(${e}, ${vec3Lit(col)}, clamp(${t} - ${lf(i)}, 0.0, 1.0))`; });
      return { out: e };
    } });
  color({ type: 'hsv', title: 'Hue · saturation · value', desc: 'A color from hue (0..1 around the wheel), saturation and brightness', keywords: 'hsv hsl hue',
    inputs: [N('h', 0.6, 0, 1, { label: 'Hue' }), N('s', 0.8, 0, 1, { label: 'Saturation' }), N('v', 1, 0, 2, { label: 'Brightness' })], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => { x.h('sgHsv2rgb'); return { out: `sgHsv2rgb(vec3(${x.f('h')}, ${x.f('s')}, ${x.f('v')}))` }; } });
  color({ type: 'hue-shift', title: 'Shift hue', desc: 'Turn the colors around the color wheel', keywords: 'hue rotate cycle',
    inputs: [C('color', '#ff3b8f'), N('shift', 0.1, -1, 1), N('cycle', 0, -2, 2, { label: 'Cycle / s' })], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => { x.h('sgHueShift'); return { out: `sgHueShift(${x.c3('color')}, ${x.f('shift')} + sgTime * ${x.f('cycle')})` }; } });
  color({ type: 'adjust', title: 'Brightness · contrast · saturation', desc: 'The usual color corrections', keywords: 'grade correct exposure',
    inputs: [C('color', '#808080'), N('brightness', 0, -1, 1), N('contrast', 1, 0, 3), N('saturation', 1, 0, 3), N('exposure', 1, 0, 4)], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => {
      const col = x.tmp('vec3', `${x.c3('color')} * ${x.f('exposure')} + ${x.f('brightness')}`, 'c');
      const k = x.tmp('vec3', `(${col} - 0.5) * ${x.f('contrast')} + 0.5`, 'k');
      return { out: `max(mix(vec3(dot(${k}, ${LUMA})), ${k}, ${x.f('saturation')}), 0.0)` };
    } });
  color({ type: 'invert', title: 'Invert', desc: 'Negative colors (amount mixes)', keywords: 'negative',
    inputs: [C('color', '#ffffff'), N('amount', 1, 0, 1)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `mix(${x.c3('color')}, 1.0 - ${x.c3('color')}, ${x.f('amount')})` }) });
  color({ type: 'posterize', title: 'Posterize', desc: 'Few flat bands of color', keywords: 'bands levels toon',
    inputs: [C('color', '#ffffff'), N('levels', 5, 2, 32, { step: 1 })], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `floor(${x.c3('color')} * ${x.f('levels')} + 0.5) / ${x.f('levels')}` }) });
  color({ type: 'gamma', title: 'Gamma', desc: 'Brighten the darks (below 1) or deepen them (above 1)', keywords: 'curve midtones',
    inputs: [C('color', '#ffffff'), N('gamma', 1, 0.2, 4)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `pow(max(${x.c3('color')}, 0.0), vec3(${x.f('gamma')}))` }) });
  color({ type: 'luma', title: 'Brightness of', desc: 'How bright a color is (0..1)', keywords: 'luminance gray grey value',
    inputs: [C('color', '#ffffff')], outputs: [O('out', 'float', 'Brightness')], glsl: (c, x) => ({ out: `dot(${x.c3('color')}, ${LUMA})` }) });
  color({ type: 'rgb', title: 'Make color (r, g, b)', desc: 'A color from three numbers', keywords: 'rgb combine channels',
    inputs: [N('r', 1, 0, 2), N('g', 0.5, 0, 2), N('b', 0.2, 0, 2)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `vec3(${x.f('r')}, ${x.f('g')}, ${x.f('b')})` }) });
  color({ type: 'split-rgb', title: 'Split color', desc: 'The red, green and blue of a color', keywords: 'channels separate',
    inputs: [C('color', '#ffffff')], outputs: [O('r', 'float', 'Red'), O('g', 'float', 'Green'), O('b', 'float', 'Blue')],
    glsl: (c, x) => { const k = x.tmp('vec3', x.c3('color'), 'c'); return { r: `${k}.r`, g: `${k}.g`, b: `${k}.b` }; } });
  color({ type: 'duotone', title: 'Duotone', desc: 'Two colors: one for the darks, one for the brights (from a number or a picture\'s brightness)', keywords: 'two tone gradient map',
    inputs: [N('t', 0.5, 0, 1), C('dark', '#14062e'), C('bright', '#ff8c42'), N('contrast', 1.2, 0.2, 4)], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => ({ out: `mix(${x.c3('dark')}, ${x.c3('bright')}, clamp((${x.f('t')} - 0.5) * ${x.f('contrast')} + 0.5, 0.0, 1.0))` }) });
  color({ type: 'vignette', title: 'Vignette', desc: 'Darken (or tint) the corners', keywords: 'corners frame dark edges',
    inputs: [C('color', '#ffffff'), N('amount', 0.6, 0, 2), N('softness', 0.5, 0.05, 1), C('tint', '#000000')], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => { const v = x.tmp('float', `1.0 - smoothstep(0.8 - ${x.f('softness')}, 0.8, length(sgUV - 0.5) * 1.2)`, 'v'); return { out: `mix(${x.c3('tint')}, ${x.c3('color')}, mix(1.0, ${v}, clamp(${x.f('amount')}, 0.0, 1.0)))` }; } });
  color({ type: 'tonemap', title: 'Tone map', desc: 'Squeeze bright, glowing colors into range (filmic ACES)', keywords: 'aces hdr filmic exposure',
    inputs: [C('color', '#ffffff'), N('exposure', 1, 0, 4)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => { x.h('sgAces'); return { out: `sgAces(${x.c3('color')} * ${x.f('exposure')})` }; } });
  color({ type: 'colorize', title: 'Colorize', desc: 'Tint a number (mask, noise, shape) with a color', keywords: 'tint multiply mask color',
    inputs: [N('t', 1, 0, 2, { label: 'Amount' }), C('color', '#48ddff')], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `${x.c3('color')} * ${x.f('t')}` }) });

  // Mix & blend
  const blend = cat('Mix & blend', '#f5a3d0');
  const MODES = { normal: (a, b) => b, add: (a, b) => `${a} + ${b}`, multiply: (a, b) => `${a} * ${b}`, screen: (a, b) => `1.0 - (1.0 - ${a}) * (1.0 - ${b})`, overlay: (a, b) => `mix(2.0 * ${a} * ${b}, 1.0 - 2.0 * (1.0 - ${a}) * (1.0 - ${b}), step(0.5, ${a}))`, difference: (a, b) => `abs(${a} - ${b})`, lighten: (a, b) => `max(${a}, ${b})`, darken: (a, b) => `min(${a}, ${b})`, 'soft light': (a, b) => `(1.0 - 2.0 * ${b}) * ${a} * ${a} + 2.0 * ${b} * ${a}`, subtract: (a, b) => `max(${a} - ${b}, 0.0)` };
  blend({ type: 'mix-color', title: 'Mix colors', desc: 'Blend color A to B by t (a mask, a hit, noise…)', keywords: 'lerp mask blend',
    inputs: [C('a', '#0b0221', { label: 'A' }), C('b', '#ff8c42', { label: 'B' }), N('t', 0.5, 0, 1)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `mix(${x.c3('a')}, ${x.c3('b')}, clamp(${x.f('t')}, 0.0, 1.0))` }) });
  blend({ type: 'blend', title: 'Blend', desc: 'Layer B over A: add, multiply, screen, overlay, difference…', keywords: 'blend mode layer composite',
    inputs: [C('a', '#202020', { label: 'Base' }), C('b', '#ff6b9d', { label: 'Top' }), N('opacity', 1, 0, 1), SEL('mode', Object.keys(MODES), { value: 'screen' })], outputs: [O('out', 'color', 'Color')], badge: (n) => n.values?.mode || 'screen',
    glsl: (c, x) => { const a = x.tmp('vec3', x.c3('a'), 'a'); const b = x.tmp('vec3', x.c3('b'), 'b'); return { out: `mix(${a}, ${(MODES[x.val('mode')] || MODES.screen)(a, b)}, ${x.f('opacity')})` }; } });
  blend({ type: 'add-glow', title: 'Add glow', desc: 'Add a colored glow where a mask is (shapes, glows, hits)', keywords: 'emit light additive',
    inputs: [C('base', '#000000'), N('mask', 0, 0, 4), C('color', '#ff8c42')], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `${x.c3('base')} + ${x.c3('color')} * ${x.f('mask')}` }) });
  blend({ type: 'mask', title: 'Mask', desc: 'Show B where the mask is 1, A where it is 0', keywords: 'matte cutout select',
    inputs: [C('a', '#000000', { label: 'Outside' }), C('b', '#ffffff', { label: 'Inside' }), N('mask', 0.5, 0, 1)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => ({ out: `mix(${x.c3('a')}, ${x.c3('b')}, clamp(${x.f('mask')}, 0.0, 1.0))` }) });

  // Picture (the layers below in a Lab filter layer; a test card or a Lab still in the playground and the preview)
  const pic = cat('Picture', '#c9b79c');
  pic({ type: 'picture', title: 'Picture below', desc: 'The picture under this layer (filter layers). In the playground: a test card; in the preview: a still of the Lab (⋯)', keywords: 'source texture image sample input video',
    inputs: [UV()], outputs: [O('out', 'color', 'Color'), O('luma', 'float', 'Brightness')],
    glsl: (c, x) => { c.shared.usesSource = true; const s = x.tmp('vec3', `sgSource(${x.in('uv')})`, 's'); return { out: s, luma: `dot(${s}, ${LUMA})` }; } });
  pic({ type: 'rgb-split', title: 'RGB split', desc: 'Pull red, green and blue apart (harder on hits when wired)', keywords: 'chromatic aberration glitch',
    inputs: [UV(), N('amount', 0.006, 0, 0.1), N('angle', 0, -180, 180, { label: 'Angle °' })], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => { c.shared.usesSource = true; const uv = x.tmp('vec2', x.in('uv'), 'uv'); const o = x.tmp('vec2', `vec2(cos(${x.f('angle')} * 0.0174533), sin(${x.f('angle')} * 0.0174533)) * ${x.f('amount')}`, 'o'); return { out: `vec3(sgSource(${uv} + ${o}).r, sgSource(${uv}).g, sgSource(${uv} - ${o}).b)` }; } });
  pic({ type: 'blur', title: 'Blur', desc: 'A soft 9-tap blur of the picture', keywords: 'soften gaussian',
    inputs: [UV(), N('radius', 2, 0, 20)], outputs: [O('out', 'color', 'Color')], glsl: (c, x) => { c.shared.usesSource = true; x.h('sgBlur'); return { out: `sgBlur(${x.in('uv')}, ${x.f('radius')})` }; } });
  pic({ type: 'edges', title: 'Edges', desc: 'Outlines of the picture (Sobel edge detection)', keywords: 'sobel outline lines detect',
    inputs: [UV(), N('width', 1, 0.5, 6), N('gain', 2, 0, 8)], outputs: [O('out', 'float', 'Edges')], glsl: (c, x) => { c.shared.usesSource = true; x.h('sgEdge'); return { out: `clamp(sgEdge(${x.in('uv')}, ${x.f('width')}) * ${x.f('gain')}, 0.0, 1.0)` }; } });
  pic({ type: 'previous', title: 'Previous frame', desc: 'What this layer showed last frame: trails and feedback (Lab filter layers only; black elsewhere)', keywords: 'feedback trails echo',
    inputs: [UV(), N('zoom', 0.995, 0.9, 1.1)], outputs: [O('out', 'color', 'Color')],
    glsl: (c, x) => { c.shared.feedback = true; return { out: `sgPrev((${x.in('uv')} - 0.5) * ${x.f('zoom')} + 0.5)` }; } });

  // Output
  def({ type: 'output', title: 'Output', category: 'Output', color: '#ffffff', desc: 'The final color of each pixel. Opacity lets the picture below show through (filter and Lab layers).', keywords: 'result final fragcolor',
    inputs: [C('color', '#000000'), N('opacity', 1, 0, 1)], outputs: [],
    glsl: (c, x) => {
      if (c.shared.out) { c.warn('Only one Output is used'); return {}; }
      c.shared.out = x.c3('color'); c.shared.alpha = x.f('opacity');
      return {};
    } });

  // ---------- assembling ----------
  function core(parts) {
    const body = [];
    for (const { node, def: d, code } of parts.frame) {
      body.push(`  // ${node.title || d.title} (${node.id})`);
      for (const s of code) for (const l of String(s).split('\n')) body.push(`  ${l}`);
    }
    return [...parts.helpers.values(), '',
      'vec4 sgMain(vec2 sgUV) {',
      '  vec2 sgP = (sgUV - 0.5) * vec2(sgRes.x / sgRes.y, 1.0) * 2.0;',
      ...body,
      `  return vec4(${parts.shared.out || 'vec3(0.0)'}, ${parts.shared.alpha || '1.0'});`,
      '}'].join('\n');
  }
  const TESTCARD = `vec3 sgSource(vec2 uv) {
  vec2 q = vec2(uv.x * sgRes.x / sgRes.y, uv.y);
  vec3 c = mix(vec3(0.106, 0.059, 0.231), vec3(1.0, 0.549, 0.259), clamp(uv.x * 0.6 + uv.y * 0.4, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.843, 0.369), 1.0 - smoothstep(0.24, 0.25, length(q - vec2(0.42 * sgRes.x / sgRes.y, 0.5))));
  c = mix(c, vec3(0.282, 0.867, 1.0), step(abs(uv.x - 0.72), 0.12) * step(abs(uv.y - 0.55), 0.2));
  return c + 0.04 * step(0.5, fract(uv.y * 40.0));
}`;
  const SIM_MUSIC = (T) => [
    `#define sgKick exp(-fract(${T} * 2.0) * 6.0)`,
    `#define sgSnare (exp(-fract(${T} * 2.0) * 7.0) * step(1.0, mod(floor(${T} * 2.0), 2.0)))`,
    `#define sgHats (0.7 * exp(-fract(${T} * 4.0) * 9.0))`,
    `#define sgHit exp(-fract(${T} * 0.5) * 4.0)`,
    `#define sgBeat exp(-fract(${T} * 2.0) * 4.0)`,
    `#define sgBass clamp(0.5 + 0.3 * sin(${T} * 2.1) + 0.2 * sgKick, 0.0, 1.0)`,
    `#define sgLevel clamp(0.55 + 0.25 * sin(${T} * 0.9) + 0.2 * sgBeat, 0.0, 1.0)`,
    `#define sgDrop exp(-mod(${T}, 16.0) / 0.6)`,
    `#define sgBeatPhase fract(${T} * 2.0)`,
  ];
  const UNI_MUSIC = ['#define sgKick uKick', '#define sgSnare uSnare', '#define sgHats uHats', '#define sgHit uHit', '#define sgBeat uBeat', '#define sgBass uBass', '#define sgLevel uLevel', '#define sgDrop uDrop', '#define sgBeatPhase uBeatPhase'];
  const MUSIC_UNIFORMS = ['uKick', 'uSnare', 'uHats', 'uHit', 'uBeat', 'uBass', 'uLevel', 'uDrop', 'uBeatPhase'];
  const tweakType = (t) => (typeof t.value === 'string' && t.value.startsWith('#') ? 'vec3' : 'float');
  const tweakLit = (t) => (tweakType(t) === 'vec3' ? vec3Lit(t.value) : lf(typeof t.value === 'boolean' ? Number(t.value) : t.value));
  const jsLit = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));
  const tweakSpec = (t) => [`value: ${jsLit(t.value)}`, t.min != null ? `min: ${t.min}` : '', t.max != null ? `max: ${t.max}` : '', t.step ? `step: ${t.step}` : '', t.options ? `options: ${jsLit(t.options)}` : '', `label: ${jsLit(t.label)}`, `group: ${jsLit(t.group)}`].filter(Boolean).join(', ');
  const tweakBlock = (tw) => (tw.length ? ['const P = tweak({', ...tw.map((t) => `  ${t.key}: { ${tweakSpec(t)} },`), '});'] : ['const P = {};']);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const TARGETS = {
    playground: 'Shader playground (GLSL)', filter: 'Lab filter layer', layer: 'Lab layer', sketch: 'New Lab sketch', shadertoy: 'Shadertoy',
  };

  // graph → code for one target. Returns { code, frag, errors, warnings, tweaks, usesSource, feedback, graph }
  function build(graph, target = 'playground', { embedGraph = true } = {}) {
    const r = reg.compile(graph);
    const shared = r.parts.shared;
    const tw = r.parts.tweaks;
    const coreCode = r.code;
    const errors = [...r.errors];
    if (!shared.out) r.warnings.push({ message: 'Connect something to the Output node' });
    const consts = tw.map((t) => `const ${tweakType(t)} u_${t.key} = ${tweakLit(t)};`);
    const head = '// Made with Shader nodes (Ctrl+K → Shader nodes, or /shader-nodes): the last line keeps the graph.';
    let code = '';
    let frag = '';
    if (target === 'playground') {
      frag = [head, '// Music is simulated at 120 bpm here; Lab layers use the song (your markers, ⚡ triggers).',
        '#define sgRes uResolution', '#define sgTime uTime', '#define sgMouse (uMouse / max(uResolution, vec2(1.0)))', ...SIM_MUSIC('uTime'), ...consts,
        TESTCARD, 'vec3 sgPrev(vec2 uv) { return vec3(0.0); }', coreCode,
        'void main() {', '  vec4 c = sgMain(gl_FragCoord.xy / uResolution);', '  fragColor = vec4(c.rgb * c.a, 1.0);', '}'].join('\n');
      code = embedGraph ? NodeView.embed(frag, r.graph, reg) : frag;
    } else if (target === 'shadertoy') {
      frag = [head.replace(' (Ctrl+K → Shader nodes, or /shader-nodes)', ' in Hearth'), '#define sgRes iResolution.xy', '#define sgTime iTime', '#define sgMouse (iMouse.xy / iResolution.xy)', ...SIM_MUSIC('iTime'), ...consts,
        shared.usesSource ? 'vec3 sgSource(vec2 uv) { return texture(iChannel0, uv).rgb; }' : TESTCARD, 'vec3 sgPrev(vec2 uv) { return vec3(0.0); }', coreCode,
        'void mainImage(out vec4 fragColor, in vec2 fragCoord) {', '  vec4 c = sgMain(fragCoord / iResolution.xy);', '  fragColor = vec4(c.rgb * c.a, 1.0);', '}'].join('\n');
      code = embedGraph ? NodeView.embed(frag, r.graph, reg) : frag;
    } else if (target === 'filter') {
      // GLSL ES 1.0 body for the sandbox's filter(): uSrc, uPrev, uRes, uTime and the music come from its header;
      // P keys become u_<key> uniforms on their own (declared by the sandbox)
      frag = ['#define sgRes uRes', '#define sgTime uTime', '#define sgMouse vec2(0.5)', ...UNI_MUSIC,
        'vec3 sgSource(vec2 uv) { return texture2D(uSrc, uv).rgb; }', shared.feedback ? 'vec3 sgPrev(vec2 uv) { return texture2D(uPrev, uv).rgb; }' : 'vec3 sgPrev(vec2 uv) { return vec3(0.0); }', coreCode,
        'void main() {', '  vec4 c = sgMain(vUv);', '  gl_FragColor = vec4(mix(texture2D(uSrc, vUv).rgb, c.rgb, clamp(c.a, 0.0, 1.0)), 1.0);', '}'].join('\n');
      const name = `nodes-${hash(frag)}`;
      code = ['// A filter layer made with Shader nodes: it restyles every layer below it. Its knobs are the sliders;',
        '// the last line keeps the node graph (switch the code pane to Nodes, or /shader-nodes, to edit it).',
        ...tweakBlock(tw),
        `filter.define('${name}', { feedback: ${Boolean(shared.feedback)}, frag: \`\n${frag.replace(/`/g, "'").replace(/\$\{/g, '$ {')}\n\` });`,
        `filter('${name}', P);`].join('\n');
      if (embedGraph) code = NodeView.embed(code, r.graph, reg);
    } else {
      // a layer (or a new sketch) of its own: a full-screen ShaderMaterial fed with the song every frame
      frag = ['varying vec2 vUv;', 'uniform vec2 uRes;', 'uniform float uTime;', 'uniform vec2 uMouse;', ...MUSIC_UNIFORMS.map((u) => `uniform float ${u};`), ...tw.map((t) => `uniform ${tweakType(t)} u_${t.key};`),
        '#define sgRes uRes', '#define sgTime uTime', '#define sgMouse uMouse', ...UNI_MUSIC, TESTCARD, 'vec3 sgPrev(vec2 uv) { return vec3(0.0); }', coreCode,
        'void main() {', '  gl_FragColor = sgMain(vUv);', '}'].join('\n');
      const colorKeys = tw.filter((t) => tweakType(t) === 'vec3');
      code = ["import * as THREE from 'three';", '',
        '// A full-screen shader made with Shader nodes; it reacts to the song (your markers, ⚡ triggers, levels).',
        '// Its knobs are the sliders; the last line keeps the node graph (/shader-nodes edits it).',
        ...tweakBlock(tw), '',
        'const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });',
        'renderer.setPixelRatio(Math.min(devicePixelRatio, 2));', 'renderer.setSize(innerWidth, innerHeight);', 'document.body.append(renderer.domElement);',
        'const scene = new THREE.Scene();', 'const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);',
        `const uniforms = { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, ${MUSIC_UNIFORMS.map((u) => `${u}: { value: 0 }`).join(', ')}${tw.length ? `, ${tw.map((t) => `u_${t.key}: { value: ${tweakType(t) === 'vec3' ? 'new THREE.Vector3()' : 0} }`).join(', ')}` : ''} };`,
        `const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthTest: false, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: \`\n${frag.replace(/`/g, "'").replace(/\$\{/g, '$ {')}\n\` });`,
        'scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));',
        "addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));",
        "addEventListener('pointermove', (e) => uniforms.uMouse.value.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight));",
        colorKeys.length ? "const hex = (h, v) => { const x = parseInt(String(h).slice(1), 16) || 0; v.set((x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255); };" : null,
        'const size = new THREE.Vector2();', 'const t0 = performance.now();',
        'renderer.setAnimationLoop(() => {',
        '  renderer.getDrawingBufferSize(size);', '  uniforms.uRes.value.copy(size);',
        '  uniforms.uTime.value = audio.loaded ? audio.time : (performance.now() - t0) / 1000;',
        '  uniforms.uKick.value = audio.kick; uniforms.uSnare.value = audio.snare; uniforms.uHats.value = audio.hats; uniforms.uHit.value = audio.hit;',
        '  uniforms.uBeat.value = audio.beat; uniforms.uBass.value = audio.bass; uniforms.uLevel.value = audio.level;',
        '  uniforms.uDrop.value = Number.isFinite(audio.sinceDrop) ? Math.exp(-audio.sinceDrop / 0.6) : 0; uniforms.uBeatPhase.value = audio.beatPhase || 0;',
        ...tw.map((t) => (tweakType(t) === 'vec3' ? `  hex(P.${t.key}, uniforms.u_${t.key}.value);` : `  uniforms.u_${t.key}.value = Number(P.${t.key});`)),
        '  renderer.render(scene, camera);', '});'].filter((l) => l != null).join('\n');
      if (embedGraph) code = NodeView.embed(code, r.graph, reg);
    }
    return { code, frag, core: coreCode, errors, warnings: r.warnings, tweaks: tw, usesSource: Boolean(shared.usesSource), feedback: Boolean(shared.feedback), graph: r.graph };
  }
  // The preview's own GLSL ES 3.0 (uniforms for the music and every knob, so dragging a knob needs no recompile)
  function previewSource(graph) {
    const r = reg.compile(graph);
    const tw = r.parts.tweaks;
    const pre = ['#version 300 es', 'precision highp float;', 'uniform vec2 uRes;', 'uniform float uTime;', 'uniform vec2 uMouse;', 'uniform sampler2D uSrc;', 'uniform float uHasSrc;', ...MUSIC_UNIFORMS.map((u) => `uniform float ${u};`),
      ...tw.map((t) => `uniform ${tweakType(t)} u_${t.key};`), 'out vec4 fragColor;',
      '#define sgRes uRes', '#define sgTime uTime', '#define sgMouse uMouse', ...UNI_MUSIC,
      TESTCARD.replace('vec3 sgSource(vec2 uv) {', 'vec3 sgTestCard(vec2 uv) {'),
      'vec3 sgSource(vec2 uv) { return uHasSrc > 0.5 ? texture(uSrc, vec2(uv.x, 1.0 - uv.y)).rgb : sgTestCard(uv); }', 'vec3 sgPrev(vec2 uv) { return vec3(0.0); }'];
    const src = [...pre, r.code, 'void main() { vec4 c = sgMain(gl_FragCoord.xy / uRes); fragColor = vec4(c.rgb * c.a, 1.0); }'].join('\n');
    return { src, tweaks: tw, errors: r.errors, warnings: r.warnings, graph: r.graph, usesSource: Boolean(r.parts.shared.usesSource) };
  }
  // which node a GLSL line belongs to (the "// Title (id)" comments in sgMain)
  function nodeAtLine(src, line) {
    const lines = src.split('\n');
    for (let i = Math.min(line - 1, lines.length - 1); i >= 0; i -= 1) {
      const m = /^\s*\/\/ .* \(([\w-]+)\)$/.exec(lines[i]);
      if (m) return m[1];
      if (/^vec4 sgMain\(/.test(lines[i])) return null;
    }
    return null;
  }

  // ---------- presets ----------
  const PRESETS = [];
  // preset(id, name, desc, build(g), { filter, tags }): g.add(type, values?, title?) → id, g.link('a.out', 'b.in')
  function preset(id, name, desc, b, o = {}) { PRESETS.push({ id, name, desc, build: b, ...o }); }
  function buildPreset(p) {
    const g = NodeView.emptyGraph('shader');
    const api = {
      add(type, values = {}, title) { const d = reg.get(type); if (!d) throw new Error(`preset ${p.id}: unknown node ${type}`); const id = reg.idFor(d, g); g.nodes.push({ id, type, x: 0, y: 0, values, ...(title ? { title } : {}) }); return id; },
      link(a, b) { const [x, xp] = a.split('.'); const [y, yp] = b.split('.'); g.links.push({ from: [x, xp], to: [y, yp] }); },
    };
    p.build(api);
    const graph = NodeView.normalize(g, reg);
    NodeView.autoLayout(graph, reg, { colW: 230 });
    graph.meta = { preset: p.id, ...(p.filter ? { target: 'filter' } : {}) };
    return graph;
  }
  const findPreset = (q) => { const s = String(q || '').trim().toLowerCase(); return PRESETS.find((p) => p.id === s) || PRESETS.find((p) => p.name.toLowerCase() === s) || PRESETS.find((p) => `${p.id} ${p.name} ${p.tags || ''}`.toLowerCase().includes(s)); };

  preset('plasma', 'Plasma waves', 'Classic plasma: summed sine waves through a neon palette, pumping on the kick', (g) => {
    const uv = g.add('uv'); const w1 = g.add('stripes', { count: 6, angle: 30, speed: 0.6, sharpness: 0 }); const w2 = g.add('stripes', { count: 9, angle: -50, speed: -0.4, sharpness: 0 });
    const r = g.add('ripple', { amount: 0, freq: 14, speed: 3 }); const sum = g.add('math', { op: 'add' }); const sum2 = g.add('math', { op: 'add' });
    const pal = g.add('palette', { palette: 'neon', cycle: 0.08 }); const hits = g.add('hits'); const k = g.add('math', { op: 'multiply', b: 0.35 });
    const adj = g.add('adjust', { brightness: 0 }); const out = g.add('output');
    g.link(`${uv}.centered`, `${w1}.p`); g.link(`${uv}.centered`, `${w2}.p`); g.link(`${uv}.centered`, `${r}.p`);
    g.link(`${w1}.out`, `${sum}.a`); g.link(`${w2}.out`, `${sum}.b`); g.link(`${sum}.out`, `${sum2}.a`); g.link(`${r}.rings`, `${sum2}.b`);
    g.link(`${sum2}.out`, `${pal}.t`); g.link(`${hits}.kick`, `${k}.a`); g.link(`${k}.out`, `${adj}.brightness`); g.link(`${pal}.out`, `${adj}.color`); g.link(`${adj}.out`, `${out}.color`);
  }, { tags: 'sine retro demo scene' });
  preset('kick-tunnel', 'Kick tunnel', 'Fly down a striped tunnel; the kick pushes you forward and flashes the rings', (g) => {
    const tp = g.add('to-polar', { twist: 0.4, zoom: 1 }); const time = g.add('time', { speed: 1.2 }); const hits = g.add('hits');
    const fwd = g.add('math', { op: 'add' }); const stripes = g.add('stripes', { count: 6, angle: 90, speed: 0, sharpness: 0.6 });
    const pos = g.add('vec-math', { op: 'add', scale: 1 }); const off = g.add('combine', { x: 0 }); const pal = g.add('palette', { palette: 'vapor', cycle: 0.05 });
    const fade = g.add('polar'); const glow = g.add('mix-color', { a: '#000000' }); const flash = g.add('add-glow', { color: '#ffd75e' }); const kk = g.add('math', { op: 'multiply', b: 0.6 }); const out = g.add('output');
    g.link(`${time}.t`, `${fwd}.a`); g.link(`${hits}.kick`, `${fwd}.b`); g.link(`${fwd}.out`, `${off}.y`); g.link(`${tp}.tunnel`, `${pos}.a`); g.link(`${off}.out`, `${pos}.b`);
    g.link(`${pos}.out`, `${stripes}.p`); g.link(`${stripes}.out`, `${pal}.t`); g.link(`${pal}.out`, `${glow}.b`); g.link(`${fade}.radius`, `${glow}.t`);
    g.link(`${glow}.out`, `${flash}.base`); g.link(`${hits}.kick`, `${kk}.a`); g.link(`${kk}.out`, `${flash}.mask`); g.link(`${flash}.out`, `${out}.color`);
  }, { tags: 'tunnel kick fly' });
  preset('voronoi-beat', 'Voronoi beat cells', 'Glowing cell edges that flare on every kick, colored per cell', (g) => {
    const vor = g.add('voronoi', { scale: 5, speed: 1.2 }); const hits = g.add('hits'); const pal = g.add('palette', { palette: 'acid', cycle: 0.05 });
    const edge = g.add('smoothstep', { edge0: 0.12, edge1: 0 }); const amt = g.add('music-amount', { source: 'kick', amount: 1.5, base: 0.4 });
    const em = g.add('math', { op: 'multiply' }); const dark = g.add('colorize', { t: 0.25 }); const glow = g.add('add-glow', { color: '#ffffff' }); const tone = g.add('tonemap', { exposure: 1.2 }); const out = g.add('output');
    g.link(`${vor}.id`, `${pal}.t`); g.link(`${vor}.edge`, `${edge}.x`); g.link(`${edge}.out`, `${em}.a`); g.link(`${amt}.out`, `${em}.b`);
    g.link(`${pal}.out`, `${dark}.color`); g.link(`${dark}.out`, `${glow}.base`); g.link(`${em}.out`, `${glow}.mask`); g.link(`${pal}.out`, `${glow}.color`); g.link(`${glow}.out`, `${tone}.color`); g.link(`${tone}.out`, `${out}.color`);
    void hits;
  }, { tags: 'cells worley glow' });
  preset('nebula', 'Nebula clouds', 'Slow fractal clouds through a color ramp, breathing with the bass', (g) => {
    const warp = g.add('noise-warp', { amount: 0.6, scale: 1.5, speed: 0.08 }); const fbm = g.add('fbm', { scale: 2, speed: 0.04, octaves: '6' }); const lv = g.add('levels');
    const bass = g.add('math', { op: 'multiply', b: 0.35 }); const sum = g.add('math', { op: 'add' }); const ramp = g.add('ramp', { colors: ['#05010f', '#2b0b4f', '#b4247a', '#ff8c42', '#fff1c4'] }); const v = g.add('vignette', { amount: 0.7 }); const out = g.add('output');
    g.link(`${warp}.out`, `${fbm}.p`); g.link(`${fbm}.out`, `${sum}.a`); g.link(`${lv}.bass`, `${bass}.a`); g.link(`${bass}.out`, `${sum}.b`); g.link(`${sum}.out`, `${ramp}.t`); g.link(`${ramp}.out`, `${v}.color`); g.link(`${v}.out`, `${out}.color`);
  }, { tags: 'clouds space smoke fbm' });
  preset('mandala', 'Kaleido mandala', 'A spinning kaleidoscope of noise and stars with a hue that cycles on the beat', (g) => {
    const k = g.add('kaleido', { segments: 8, spin: 0.03 }); const st = g.add('star', { points: 8, radius: 0.55, inner: 0.35 }); const n = g.add('simplex', { scale: 2.5, speed: 0.4 });
    const glow = g.add('glow', { width: 0.005, glow: 0.015, strength: 1.2 }); const pal = g.add('palette', { palette: 'candy', cycle: 0.1 }); const col = g.add('colorize'); const hs = g.add('hue-shift', { cycle: 0.05 }); const beat = g.add('music-amount', { source: 'beat', amount: 0.15 }); const out = g.add('output');
    g.link(`${k}.out`, `${st}.p`); g.link(`${k}.out`, `${n}.p`); g.link(`${st}.d`, `${glow}.d`); g.link(`${n}.out`, `${pal}.t`); g.link(`${pal}.out`, `${col}.color`); g.link(`${glow}.out`, `${col}.t`);
    g.link(`${col}.out`, `${hs}.color`); g.link(`${beat}.out`, `${hs}.shift`); g.link(`${hs}.out`, `${out}.color`);
  }, { tags: 'kaleidoscope symmetry flower' });
  preset('neon-ring', 'Neon ring pulse', 'A neon ring that grows on the kick and glows hotter on the snare', (g) => {
    const kick = g.add('music-amount', { source: 'kick', amount: 0.25, base: 0.5 }); const ring = g.add('ring', { width: 0.01 }); const snare = g.add('music-amount', { source: 'snare', amount: 2, base: 1 });
    const glow = g.add('glow', { width: 0.004, glow: 0.02 }); const col = g.add('colorize', { color: '#ff3b8f' }); const bg = g.add('gradient', { kind: 'radial' }); const bgc = g.add('mix-color', { a: '#160626', b: '#000000' }); const add = g.add('blend', { mode: 'add' }); const tone = g.add('tonemap'); const out = g.add('output');
    g.link(`${kick}.out`, `${ring}.radius`); g.link(`${ring}.d`, `${glow}.d`); g.link(`${snare}.out`, `${glow}.strength`); g.link(`${glow}.out`, `${col}.t`); g.link(`${bg}.out`, `${bgc}.t`);
    g.link(`${bgc}.out`, `${add}.a`); g.link(`${col}.out`, `${add}.b`); g.link(`${add}.out`, `${tone}.color`); g.link(`${tone}.out`, `${out}.color`);
  }, { tags: 'circle neon kick snare' });
  preset('synth-sun', 'Synthwave sun', 'A striped retro sun over a gradient sky, the stripes scrolling with the beat', (g) => {
    const pos = g.add('transform', { y: 0.15 }); const sun = g.add('circle', { radius: 0.55 }); const fill = g.add('fill', { softness: 0.005 }); const stripes = g.add('stripes', { count: 14, angle: 90, speed: -0.6, sharpness: 1 });
    const cut = g.add('step', { edge: 0.25 }); const below = g.add('split'); const maskY = g.add('smoothstep', { edge0: 0.1, edge1: -0.2 }); const mx = g.add('math', { op: 'max' }); const m = g.add('math', { op: 'multiply' });
    const sky = g.add('gradient', { kind: 'linear', angle: 90 }); const skyc = g.add('ramp', { colors: ['#ff2f6a', '#7b2ff7', '#0b0221'] }); const sunc = g.add('ramp', { colors: ['#ff2f6a', '#ffd75e'] }); const sg = g.add('gradient', { kind: 'linear', angle: 90 });
    const mix = g.add('mask'); const out = g.add('output');
    g.link(`${pos}.out`, `${sun}.p`); g.link(`${sun}.d`, `${fill}.d`); g.link(`${pos}.out`, `${stripes}.p`); g.link(`${stripes}.out`, `${cut}.x`); g.link(`${pos}.out`, `${below}.v`); g.link(`${below}.y`, `${maskY}.x`);
    g.link(`${cut}.out`, `${mx}.a`); g.link(`${maskY}.out`, `${mx}.b`); g.link(`${fill}.mask`, `${m}.a`); g.link(`${mx}.out`, `${m}.b`);
    g.link(`${sky}.out`, `${skyc}.t`); g.link(`${sg}.out`, `${sunc}.t`); g.link(`${skyc}.out`, `${mix}.a`); g.link(`${sunc}.out`, `${mix}.b`); g.link(`${m}.out`, `${mix}.mask`); g.link(`${mix}.out`, `${out}.color`);
  }, { tags: 'retro outrun sun 80s' });
  preset('liquid', 'Liquid chrome', 'Domain-warped noise through a metallic ramp: slow liquid metal', (g) => {
    const w = g.add('noise-warp', { amount: 0.9, scale: 1.8, speed: 0.15 }); const w2 = g.add('noise-warp', { amount: 0.5, scale: 3, speed: 0.1 }); const n = g.add('simplex', { scale: 2, speed: 0.1 });
    const ramp = g.add('ramp', { colors: ['#0a0a12', '#5d6b7c', '#e8f1ff', '#3a4250', '#c9d6e8'] }); const tone = g.add('adjust', { contrast: 1.3 }); const out = g.add('output');
    g.link(`${w}.out`, `${w2}.p`); g.link(`${w2}.out`, `${n}.p`); g.link(`${n}.out`, `${ramp}.t`); g.link(`${ramp}.out`, `${tone}.color`); g.link(`${tone}.out`, `${out}.color`);
  }, { tags: 'metal chrome liquid warp' });
  preset('disco-checker', 'Disco checker', 'A spinning checkerboard floor whose colors jump on every kick', (g) => {
    const t = g.add('transform', { spin: 0.05, scale: 1 }); const zp = g.add('bulge', { strength: 0.4 }); const ch = g.add('checker', { count: 10 }); const hits = g.add('hits'); const hue = g.add('hsv', { s: 0.85 });
    const beat = g.add('beat-phase'); const q = g.add('quantize', { steps: 1 }); const time = g.add('time', { speed: 0.5 }); const step = g.add('quantize', { steps: 2 }); const mx = g.add('mask', { a: '#0b0221' }); const out = g.add('output');
    g.link(`${t}.out`, `${zp}.p`); g.link(`${zp}.out`, `${ch}.p`); g.link(`${time}.t`, `${step}.x`); g.link(`${step}.out`, `${hue}.h`); g.link(`${hue}.out`, `${mx}.b`); g.link(`${ch}.out`, `${mx}.mask`); g.link(`${mx}.out`, `${out}.color`);
    void hits; void beat; void q;
  }, { tags: 'checkerboard floor party' });
  preset('starburst', 'Starburst', 'A star that spins and punches on the kick, with rays behind it', (g) => {
    const spin = g.add('transform', { spin: 0.08 }); const zp = g.add('music-amount', { source: 'kick', amount: 0.3, base: 0.5 }); const star = g.add('star', { points: 6, inner: 0.4 });
    const fill = g.add('fill', { softness: 0.01 }); const pol = g.add('polar'); const rays = g.add('oscillator', { freq: 12, wave: 'triangle' }); const raysc = g.add('mix-color', { a: '#12041f', b: '#3d0f5c' });
    const starc = g.add('palette', { palette: 'sunset', cycle: 0.1 }); const m = g.add('mask'); const out = g.add('output');
    g.link(`${spin}.out`, `${star}.p`); g.link(`${zp}.out`, `${star}.radius`); g.link(`${star}.d`, `${fill}.d`); g.link(`${spin}.out`, `${pol}.p`); g.link(`${pol}.angle`, `${rays}.x`); g.link(`${rays}.out`, `${raysc}.t`);
    g.link(`${pol}.radius`, `${starc}.t`); g.link(`${raysc}.out`, `${m}.a`); g.link(`${starc}.out`, `${m}.b`); g.link(`${fill}.mask`, `${m}.mask`); g.link(`${m}.out`, `${out}.color`);
  }, { tags: 'star rays spin kick' });
  preset('ripple-pond', 'Ripple pond', 'Rings travel out from the middle through an ocean palette', (g) => {
    const r = g.add('ripple', { amount: 0.04, freq: 30, speed: 5 }); const n = g.add('fbm', { scale: 2.5, speed: 0.1, octaves: '4' }); const sum = g.add('math', { op: 'add' }); const rings = g.add('math', { op: 'multiply', b: 0.3 });
    const pal = g.add('palette', { palette: 'ocean', cycle: 0.02 }); const out = g.add('output');
    g.link(`${r}.out`, `${n}.p`); g.link(`${n}.out`, `${sum}.a`); g.link(`${r}.rings`, `${rings}.a`); g.link(`${rings}.out`, `${sum}.b`); g.link(`${sum}.out`, `${pal}.t`); g.link(`${pal}.out`, `${out}.color`);
  }, { tags: 'water rings ocean' });
  preset('heartbeat', 'Heartbeat', 'A heart that beats on the kick, glowing pink on dark', (g) => {
    const k = g.add('music-amount', { source: 'kick', amount: 0.2, base: 0.6 }); const h = g.add('heart'); const glow = g.add('glow', { width: 0, glow: 0.03, strength: 1 }); const fill = g.add('fill', { softness: 0.01 });
    const sum = g.add('math', { op: 'add' }); const col = g.add('colorize', { color: '#ff2f6a' }); const tone = g.add('tonemap'); const out = g.add('output');
    g.link(`${k}.out`, `${h}.size`); g.link(`${h}.d`, `${glow}.d`); g.link(`${h}.d`, `${fill}.d`); g.link(`${glow}.out`, `${sum}.a`); g.link(`${fill}.mask`, `${sum}.b`); g.link(`${sum}.out`, `${col}.t`); g.link(`${col}.out`, `${tone}.color`); g.link(`${tone}.out`, `${out}.color`);
  }, { tags: 'love valentine pulse' });
  preset('led-wall', 'LED wall', 'A wall of dots whose size follows the bass and noise', (g) => {
    const dots = g.add('dots', { count: 40 }); const n = g.add('value-noise', { scale: 0.15, speed: 0.6 }); const bass = g.add('levels'); const sz = g.add('math', { op: 'multiply' }); const size = g.add('remap', { outMin: 0.05, outMax: 0.48 });
    const dots2 = g.add('dots', { count: 40 }); const pal = g.add('palette', { palette: 'fire' }); const col = g.add('colorize'); const out = g.add('output');
    g.link(`${dots}.cell`, `${n}.p`); g.link(`${n}.out`, `${sz}.a`); g.link(`${bass}.bass`, `${sz}.b`); g.link(`${sz}.out`, `${size}.x`); g.link(`${size}.out`, `${dots2}.size`);
    g.link(`${n}.out`, `${pal}.t`); g.link(`${pal}.out`, `${col}.color`); g.link(`${dots2}.out`, `${col}.t`); g.link(`${col}.out`, `${out}.color`);
  }, { tags: 'dots matrix halftone bass' });
  preset('retro-grid', 'Retro grid', 'A neon grid scrolling toward you, flashing on the kick', (g) => {
    const tp = g.add('to-polar', { zoom: 1 }); const split = g.add('split'); const per = g.add('expression', { a: 1, b: 0, expr: 'a / max(abs(p.y + 0.15), 0.02)' }); const grid = g.add('grid', { count: 6, width: 0.05 });
    const t = g.add('time', { speed: 1.5 }); const mk = g.add('expression', { a: 1, b: 0, expr: 'p.x * a / max(abs(p.y + 0.15), 0.02)' }); const pos = g.add('combine'); const y = g.add('math', { op: 'add' });
    const below = g.add('smoothstep', { edge0: -0.12, edge1: -0.2 }); const m = g.add('math', { op: 'multiply' }); const col = g.add('colorize', { color: '#ff2f6a', t: 1.5 }); const kick = g.add('music-amount', { source: 'kick', amount: 1, base: 1 }); const k = g.add('math', { op: 'multiply' }); const sky = g.add('gradient', { angle: 90 }); const skyc = g.add('ramp', { colors: ['#000000', '#1a0533', '#000000'] }); const add = g.add('blend', { mode: 'add' }); const out = g.add('output');
    g.link(`${mk}.out`, `${pos}.x`); g.link(`${per}.out`, `${y}.a`); g.link(`${t}.t`, `${y}.b`); g.link(`${y}.out`, `${pos}.y`); g.link(`${pos}.out`, `${grid}.p`);
    g.link(`${grid}.out`, `${m}.a`); g.link(`${split}.y`, `${below}.x`); g.link(`${below}.out`, `${m}.b`); g.link(`${m}.out`, `${k}.a`); g.link(`${kick}.out`, `${k}.b`); g.link(`${k}.out`, `${col}.t`);
    g.link(`${sky}.out`, `${skyc}.t`); g.link(`${skyc}.out`, `${add}.a`); g.link(`${col}.out`, `${add}.b`); g.link(`${add}.out`, `${out}.color`);
    void tp;
  }, { tags: 'tron floor outrun perspective' });
  preset('fire', 'Fire', 'Turbulent flames rising from the bottom, flaring with the bass', (g) => {
    const t = g.add('transform', { y: 0 }); const turb = g.add('turbulence', { scale: 3, speed: -1.2 }); const split = g.add('split'); const h = g.add('remap', { inMin: -1, inMax: 1, outMin: 1.2, outMax: -0.3 });
    const mul = g.add('math', { op: 'multiply' }); const bass = g.add('music-amount', { source: 'bass', amount: 0.6, base: 0.8 }); const m2 = g.add('math', { op: 'multiply' }); const ramp = g.add('ramp', { colors: ['#000000', '#5a0a00', '#ff4a00', '#ffb000', '#fff6d0'] }); const out = g.add('output');
    g.link(`${t}.out`, `${turb}.p`); g.link(`${t}.out`, `${split}.v`); g.link(`${split}.y`, `${h}.x`); g.link(`${turb}.out`, `${mul}.a`); g.link(`${h}.out`, `${mul}.b`); g.link(`${mul}.out`, `${m2}.a`); g.link(`${bass}.out`, `${m2}.b`); g.link(`${m2}.out`, `${ramp}.t`); g.link(`${ramp}.out`, `${out}.color`);
  }, { tags: 'flames heat burn' });
  // filter layers (they read the picture below)
  preset('rgb-glitch-fx', 'RGB glitch filter', 'Filter layer: RGB split on the kick and pixel blocks on the snare', (g) => {
    const snare = g.add('music-amount', { source: 'snare', amount: 120, base: 400 }); const px = g.add('pixelate'); const kick = g.add('music-amount', { source: 'kick', amount: 0.03, base: 0.002 });
    const rgb = g.add('rgb-split'); const out = g.add('output');
    g.link(`${snare}.out`, `${px}.cells`); g.link(`${px}.out`, `${rgb}.uv`); g.link(`${kick}.out`, `${rgb}.amount`); g.link(`${rgb}.out`, `${out}.color`);
  }, { filter: true, tags: 'glitch chromatic filter fx' });
  preset('vhs-fx', 'VHS wobble filter', 'Filter layer: wavy tape wobble, color bleed, grain and scanlines', (g) => {
    const uv = g.add('uv'); const wob = g.add('wave-warp', { amount: 0.004, freq: 30, speed: 6, axis: 'x' }); const back = g.add('uv-from-centered'); const rgb = g.add('rgb-split', { amount: 0.004 });
    const grain = g.add('grain', { amount: 0.1 }); const lines = g.add('stripes', { count: 220, angle: 90, speed: 0.4, sharpness: 0 }); const ln = g.add('remap', { outMin: 0.82, outMax: 1 });
    const mul = g.add('adjust', { saturation: 0.8, contrast: 1.1 }); const sc = g.add('blend', { mode: 'multiply' }); const gr = g.add('math', { op: 'add', b: 0 }); const out = g.add('output');
    g.link(`${uv}.centered`, `${wob}.p`); g.link(`${wob}.out`, `${back}.p`); g.link(`${back}.out`, `${rgb}.uv`); g.link(`${rgb}.out`, `${mul}.color`); g.link(`${grain}.out`, `${mul}.brightness`);
    g.link(`${lines}.out`, `${ln}.x`); g.link(`${mul}.out`, `${sc}.a`); g.link(`${ln}.out`, `${sc}.b`); g.link(`${sc}.out`, `${out}.color`);
    void gr;
  }, { filter: true, tags: 'tape analog retro filter fx' });
  preset('duotone-fx', 'Duotone pulse filter', 'Filter layer: two-color look whose contrast jumps on the kick', (g) => {
    const pic = g.add('picture'); const k = g.add('music-amount', { source: 'kick', amount: 0.8, base: 1.2 }); const duo = g.add('duotone', { dark: '#1b0a3a', bright: '#ffb35c' }); const out = g.add('output');
    g.link(`${pic}.luma`, `${duo}.t`); g.link(`${k}.out`, `${duo}.contrast`); g.link(`${duo}.out`, `${out}.color`);
  }, { filter: true, tags: 'two tone color filter fx' });
  preset('kaleido-fx', 'Kaleidoscope filter', 'Filter layer: the picture below mirrored into a spinning kaleidoscope', (g) => {
    const k = g.add('kaleido', { segments: 6, spin: 0.02 }); const back = g.add('uv-from-centered'); const pic = g.add('picture'); const out = g.add('output');
    g.link(`${k}.out`, `${back}.p`); g.link(`${back}.out`, `${pic}.uv`); g.link(`${pic}.out`, `${out}.color`);
  }, { filter: true, tags: 'mirror mandala filter fx' });
  preset('edge-glow-fx', 'Edge glow filter', 'Filter layer: glowing outlines of the picture in cycling colors, brighter on hits', (g) => {
    const pic = g.add('picture'); const edges = g.add('edges', { gain: 3 }); const pal = g.add('palette', { palette: 'neon', cycle: 0.2 }); const hit = g.add('music-amount', { source: 'hit', amount: 2, base: 1 });
    const m = g.add('math', { op: 'multiply' }); const dim = g.add('adjust', { brightness: -0.1, saturation: 0.6, exposure: 0.5 }); const glow = g.add('add-glow'); const out = g.add('output');
    g.link(`${edges}.out`, `${m}.a`); g.link(`${hit}.out`, `${m}.b`); g.link(`${pic}.out`, `${dim}.color`); g.link(`${dim}.out`, `${glow}.base`); g.link(`${m}.out`, `${glow}.mask`); g.link(`${pic}.luma`, `${pal}.t`); g.link(`${pal}.out`, `${glow}.color`); g.link(`${glow}.out`, `${out}.color`);
  }, { filter: true, tags: 'outline neon sobel filter fx' });
  preset('trails-fx', 'Echo trails filter', 'Filter layer: everything leaves fading, slowly zooming trails', (g) => {
    const pic = g.add('picture'); const prev = g.add('previous', { zoom: 0.99 }); const fade = g.add('adjust', { exposure: 0.92 }); const mx = g.add('blend', { mode: 'lighten' }); const out = g.add('output');
    g.link(`${prev}.out`, `${fade}.color`); g.link(`${fade}.out`, `${mx}.a`); g.link(`${pic}.out`, `${mx}.b`); g.link(`${mx}.out`, `${out}.color`);
  }, { filter: true, tags: 'feedback echo motion blur filter fx' });
  preset('empty', 'Empty graph', 'UV → Output: a gradient to start from', (g) => {
    const uv = g.add('uv'); const split = g.add('split'); const rgb = g.add('rgb', { b: 0.6 }); const out = g.add('output');
    g.link(`${uv}.uv`, `${split}.v`); g.link(`${split}.x`, `${rgb}.r`); g.link(`${split}.y`, `${rgb}.g`); g.link(`${rgb}.out`, `${out}.color`);
  }, { tags: 'blank start' });

  // ---------- preview (WebGL2, its own canvas) ----------
  function createPreview(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, '#version 300 es\nin vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }');
    gl.compileShader(vs);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let prog = null; let locs = {}; let hasSrc = 0; let raf = 0; let playing = true; let t = 0; let last = performance.now();
    const values = new Map(); // uniform name → number | [r, g, b]
    const mouse = [0.5, 0.5];
    let bpm = 120;
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse[0] = (e.clientX - r.left) / r.width; mouse[1] = 1 - (e.clientY - r.top) / r.height; });
    function compile(src) {
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, src);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(fs) || 'compile failed';
        gl.deleteShader(fs);
        return [...log.matchAll(/ERROR:\s*\d+:(\d+):\s*(.*)/g)].map((m) => ({ line: Number(m[1]), message: m[2] })).concat(/ERROR/.test(log) ? [] : [{ line: 0, message: log }]);
      }
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return [{ line: 0, message: gl.getProgramInfoLog(p) || 'link failed' }];
      if (prog) gl.deleteProgram(prog);
      prog = p; locs = {};
      return [];
    }
    const loc = (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(prog, n)));
    // the simulated song: kick on every beat, snare on 2 and 4, hats on 8ths
    function music(time) {
      const beat = 60 / bpm; const ph = (time / beat) % 1; const n = Math.floor(time / beat);
      const kick = Math.exp(-ph * 6);
      return { uKick: kick, uSnare: n % 2 ? Math.exp(-ph * 7) : 0, uHats: 0.7 * Math.exp(-((time / (beat / 2)) % 1) * 9), uHit: Math.exp(-((time / (beat * 4)) % 1) * 4), uBeat: Math.exp(-ph * 4),
        uBass: Math.min(1, Math.max(0, 0.5 + 0.3 * Math.sin(time * 2.1) + 0.2 * kick)), uLevel: Math.min(1, 0.55 + 0.25 * Math.sin(time * 0.9) + 0.2 * Math.exp(-ph * 4)), uDrop: Math.exp(-(time % (beat * 32)) / 0.6), uBeatPhase: ph };
    }
    function draw() {
      if (!prog) return;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(canvas.clientWidth * dpr)); const h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.enableVertexAttribArray(0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(loc('uRes'), w, h); gl.uniform1f(loc('uTime'), t); gl.uniform2f(loc('uMouse'), mouse[0], mouse[1]);
      gl.uniform1f(loc('uHasSrc'), hasSrc);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc('uSrc'), 0);
      for (const [k, v] of Object.entries(music(t))) gl.uniform1f(loc(k), v);
      for (const [k, v] of values) { const l = loc(k); if (!l) continue; if (Array.isArray(v)) gl.uniform3f(l, v[0], v[1], v[2]); else gl.uniform1f(l, v); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (playing) t += Math.min(0.1, (now - last) / 1000);
      last = now;
      draw();
    }
    raf = requestAnimationFrame(frame);
    return {
      compile, draw,
      setValue(name, v) { values.set(name, typeof v === 'string' && v.startsWith('#') ? hexRgb(v) : typeof v === 'boolean' ? Number(v) : Number(v)); },
      clearValues: () => values.clear(),
      setPicture(img) { if (!img) { hasSrc = 0; return; } gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); hasSrc = 1; },
      get hasPicture() { return Boolean(hasSrc); },
      toggle(on) { playing = on ?? !playing; return playing; },
      get playing() { return playing; },
      restart() { t = 0; },
      set bpm(v) { bpm = Math.max(40, Math.min(220, Number(v) || 120)); }, get bpm() { return bpm; },
      get time() { return t; },
      shot: () => canvas.toDataURL('image/png'),
      destroy() { cancelAnimationFrame(raf); gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  }

  // ---------- the editor (a dialog: nodes left, live preview right) ----------
  const GRAPH_KEY = 'shaderNodes.graph';
  let ui = null; // the open editor
  // bind: where Apply writes: { kind: 'playground' } | { kind: 'layer', id, name } | { kind: 'none' }
  function open({ graph = null, bind = null, presetId = null, title } = {}) {
    let g = graph || (presetId ? buildPreset(findPreset(presetId) || PRESETS[0]) : null);
    if (!g) { const saved = store.get(GRAPH_KEY, null); g = saved ? NodeView.normalize(saved, reg) : buildPreset(findPreset('plasma')); }
    // not linked unless asked: the playground (or a Lab layer) is only written once you link it or Apply / Send
    const b = bind || (ui ? ui.bind : { kind: 'none' });
    if (ui) { ui.bind = b; ui.view.setGraph(g); ui.refreshBind(); ui.recompile(); return ui; }
    ui = makeEditor(g, b, title);
    return ui;
  }
  function makeEditor(g0, bind0, title = 'Shader nodes') {
    const state = { bind: bind0, auto: store.get('shaderNodes.auto', true), aspect: store.get('shaderNodes.aspect', '16:9'), showCode: false, codeTarget: 'playground', lastSrc: '' };
    const canvas = el('canvas', { class: 'sg-canvas', title: 'Live preview (move the mouse over it; music simulated)' });
    const stage = el('div', { class: 'sg-stage' }, canvas);
    const info = el('div', { class: 'sg-info' });
    const codeBox = el('pre', { class: 'sg-code', hidden: true });
    const chip = (text, titleText, fn) => el('button', { class: 'sg-chip', text, title: titleText, on: { click: fn } });
    const aspects = ['16:9', '9:16', '1:1', '4:5'].map((a) => chip(a, `Preview at ${a}`, () => setAspect(a)));
    const playBtn = chip('⏸', 'Pause / play the preview', () => { playBtn.textContent = preview?.toggle() ? '⏸' : '▶'; });
    const bpmBtn = chip('120 bpm', 'Simulated tempo of the preview\'s music (click to change)', async () => { const v = await Modal.prompt('Preview tempo (bpm)', { value: String(preview?.bpm || 120) }); if (v != null && preview) { preview.bpm = v; bpmBtn.textContent = `${preview.bpm} bpm`; } });
    const stillBtn = chip('Lab still', 'Use a still of the Three.js Lab as "Picture below" in the preview (else a test card)', () => useLabStill());
    const codeBtn = chip('Code', 'Show the GLSL this graph makes', () => { state.showCode = !state.showCode; codeBox.hidden = !state.showCode; codeBtn.classList.toggle('on', state.showCode); paintCode(); });
    const side = el('div', { class: 'sg-side' }, el('div', { class: 'sg-row' }, ...aspects, el('span', { class: 'spacer' }), playBtn), stage, el('div', { class: 'sg-row' }, bpmBtn, stillBtn, codeBtn), info, codeBox);
    const bindNote = el('span', { class: 'sg-bind' });
    const dlg = NodeView.showGraph(g0, reg, {
      title, readOnly: false, className: 'sg-dialog', side, storeKey: 'shader.nodes',
      actions: [
        { label: 'Presets…', title: 'Start from one of the shader presets', run: () => presetPicker(), close: false },
        { label: 'Send to…', title: 'Playground, Lab filter layer, Lab layer, new sketch, Shadertoy, copy', run: () => sendMenu(), close: false },
        { label: 'Apply', primary: true, title: 'Write the shader where it came from (the playground or the Lab layer)', run: () => apply(true), close: false },
      ],
      onChange: (graph, info2) => onGraph(graph, info2),
      menuItems: () => [
        'Shader nodes',
        ['Presets…', '', () => presetPicker()],
        ['Apply as you edit', 'Writes the shader to its target after every change (playground: instant)', () => { state.auto = !state.auto; store.set('shaderNodes.auto', state.auto); }, { checked: state.auto }],
        ['Copy GLSL (playground)', '', () => copyText(build(view.getGraph(), 'playground').code, 'GLSL copied')],
        ['Copy for Shadertoy', '', () => copyText(build(view.getGraph(), 'shadertoy', { embedGraph: false }).code, 'Shadertoy code copied')],
        ['Copy the graph (JSON)', '', () => copyText(JSON.stringify(NodeView.compact(view.getGraph(), reg)), 'Graph copied')],
        ['Save a preview picture…', '', () => savePreview()],
      ],
      pickerExtras: () => PRESETS.map((p) => ({ label: `Preset: ${p.name}`, category: 'Presets', desc: p.desc, run: () => usePreset(p.id) })),
      onClose: () => { preview?.destroy(); ui = null; },
    });
    const view = dlg.view;
    dlg.dialog.querySelector('.nv-dialog-head b')?.after(bindNote);
    const preview = createPreview(canvas);
    if (!preview) info.textContent = 'No WebGL2 here: the preview is off, the code still works.';
    function setAspect(a) {
      state.aspect = a; store.set('shaderNodes.aspect', a);
      const [w, h] = a.split(':').map(Number);
      stage.style.aspectRatio = `${w} / ${h}`;
      for (const b of aspects) b.classList.toggle('on', b.textContent === a);
    }
    setAspect(state.aspect);
    function refreshBind() {
      const b = state.bind;
      bindNote.textContent = b.kind === 'layer' ? `→ Lab layer “${b.name || 'layer'}”` : b.kind === 'playground' ? '→ Shader playground' : '→ not linked (Send to…)';
    }
    refreshBind();
    // compile the preview and paint errors on the nodes
    let compiled = '';
    function recompile() {
      const g = view.getGraph();
      const r = previewSource(g);
      const errs = [...r.errors];
      if (preview && r.src !== compiled) {
        compiled = r.src;
        const glErr = preview.compile(r.src);
        for (const e of glErr) errs.push({ node: e.line ? nodeAtLine(r.src, e.line) : null, message: e.message });
      }
      if (preview) { preview.clearValues(); for (const t of r.tweaks) preview.setValue(`u_${t.key}`, t.value); }
      view.setErrors(errs);
      const n = g.nodes.length; const w = g.links.length;
      const bad = errs.length ? `${errs.length} error${errs.length > 1 ? 's' : ''}: ${errs[0].message}` : '';
      const warn = !bad && r.warnings.length ? r.warnings[0].message : '';
      view.setStatus(bad || warn || `${n} nodes · ${w} wires · ${r.tweaks.length} sliders`, bad ? 'error' : warn ? '' : 'ok');
      info.textContent = r.usesSource && !preview?.hasPicture ? 'Uses the picture below: the preview shows a test card (Lab still swaps in the Lab\'s picture).' : '';
      paintCode();
      return errs;
    }
    function paintCode() {
      if (!state.showCode) return;
      const target = state.bind.kind === 'layer' ? (isFilter() ? 'filter' : 'layer') : 'playground';
      codeBox.textContent = build(view.getGraph(), target, { embedGraph: false }).code;
    }
    const isFilter = () => view.getGraph().nodes.some((n) => ['picture', 'rgb-split', 'blur', 'edges', 'previous'].includes(n.type)) || view.getGraph().meta?.target === 'filter';
    const recompileSoon = debounce(recompile, 120);
    const autoApply = debounce(() => apply(false), 600);
    function onGraph(graph, info2) {
      if (info2.live && info2.node && preview) {
        // a knob being dragged: just the uniform
        const key = `u_${info2.node}_${info2.field}`;
        preview.setValue(key, info2.value);
        return;
      }
      store.set(GRAPH_KEY, NodeView.compact(graph, reg));
      recompileSoon();
      if (state.auto && info2.kind !== 'move' && state.bind.kind !== 'none') autoApply();
    }
    async function apply(explicit) {
      const g = view.getGraph();
      const b = state.bind;
      if (b.kind === 'playground') { const r = build(g, 'playground'); toPlayground(r.code); if (explicit) toast('Sent to the shader playground', { timeout: 1500 }); return r; }
      if (b.kind === 'layer') {
        if (!explicit && !state.auto) return null;
        const r = build(g, isFilter() ? 'filter' : 'layer');
        try { await ThreeLab.director.updateLayer(b.id, { code: r.code }, 0.3); if (explicit) toast(`Layer “${b.name}” updated`, { timeout: 1500 }); } catch (err) { toast(err.message, { type: 'error' }); }
        return r;
      }
      if (explicit) sendMenu();
      return null;
    }
    function sendMenu() {
      const r = dlg.dialog.querySelector('.nv-dialog-head').getBoundingClientRect();
      NodeView.menu(r.right - 300, r.bottom + 4, [
        'Send the shader to',
        ['Shader playground', 'Opens the Lab\'s shader playground with this shader (simulated music)', () => sendTo('playground')],
        ['New Lab filter layer', 'Restyles every layer below it, with the song\'s hits', () => sendTo('filter')],
        ['New Lab layer', 'A full-screen shader layer that reacts to the song', () => sendTo('layer')],
        ['New Lab sketch', 'A sketch that is just this shader', () => sendTo('sketch')],
        '-',
        ['Copy for Shadertoy', '', () => sendTo('shadertoy')],
        ['Copy the playground GLSL', '', () => sendTo('copy')],
      ]);
    }
    async function sendTo(target) { const r = await ShaderNodes.send(target, view.getGraph()); if (r?.bind) { state.bind = r.bind; refreshBind(); } return r; }
    async function useLabStill() {
      if (!preview) return;
      if (preview.hasPicture) { preview.setPicture(null); stillBtn.classList.remove('on'); recompile(); return; }
      const url = await ThreeLab.shot?.().catch(() => null);
      if (!url) { toast('Open the Three.js Lab with a sketch first (its picture is used here)', { type: 'error' }); return; }
      const img = new Image();
      img.onload = () => { preview.setPicture(img); stillBtn.classList.add('on'); recompile(); };
      img.src = url;
    }
    async function savePreview() {
      if (!preview) return;
      const data = preview.shot().split(',')[1];
      const p = await window.hub.saveFile({ defaultPath: 'shader.png', filters: [{ name: 'PNG', extensions: ['png'] }], content: data, base64: true });
      if (p) toast('Preview saved');
    }
    function usePreset(id) {
      const p = findPreset(id);
      if (!p) throw new Error(`No shader preset "${id}". See /shader-nodes-presets.`);
      view.setGraph(buildPreset(p));
      store.set(GRAPH_KEY, NodeView.compact(view.getGraph(), reg));
      recompile();
      if (state.auto && state.bind.kind === 'playground' && !p.filter) apply(false);
      return p;
    }
    function presetPicker() {
      NodeView.presetPicker({ title: 'Shader presets', items: PRESETS.map((p) => ({ ...p, tag: p.filter ? 'filter' : '', hint: `/shader-nodes-new ${p.id}` })), onPick: (p) => usePreset(p.id) });
    }
    const api = {
      view, dialog: dlg.dialog, preview, recompile, apply, usePreset, presetPicker, refreshBind, sendTo,
      get bind() { return state.bind; }, set bind(b) { state.bind = b; },
      close: () => dlg.close(),
      setAuto: (on) => { state.auto = Boolean(on); store.set('shaderNodes.auto', state.auto); },
    };
    requestAnimationFrame(() => recompile());
    return api;
  }

  // The playground keeps one shader: the first time nodes replace hand-written code, it is kept for an Undo.
  let backedUp = false;
  function toPlayground(code) {
    const before = store.get('three.shader', '');
    if (!backedUp && before && !NodeView.extract(before)) {
      backedUp = true;
      store.set('shaderNodes.playgroundBackup', before);
      toast('The playground\'s own shader was replaced by the nodes', { timeout: 8000, action: { label: 'Undo', fn: () => ThreeLab.openShader(before) } });
    }
    ThreeLab.openShader(code);
  }
  // send a graph somewhere (also for chat commands). → { bind?, text }
  async function send(target, graph) {
    const g = graph || (ui ? ui.view.getGraph() : NodeView.normalize(store.get(GRAPH_KEY, null) || buildPreset(findPreset('plasma')), reg));
    const name = g.meta?.preset ? (findPreset(g.meta.preset)?.name || 'Shader') : 'Shader nodes';
    if (target === 'playground') { const r = build(g, 'playground'); toPlayground(r.code); return { bind: { kind: 'playground' }, text: 'Sent to the shader playground (it stays linked: Apply updates it).' }; }
    if (target === 'copy') { await copyText(build(g, 'playground').code, 'GLSL copied'); return { text: 'GLSL copied.' }; }
    if (target === 'shadertoy') { await copyText(build(g, 'shadertoy', { embedGraph: false }).code, 'Shadertoy code copied'); return { text: 'Shadertoy code copied (paste it into a new shader there).' }; }
    await ThreeLab.cmd({ show: true });
    const D = ThreeLab.director;
    if (!D) throw new Error('The Three.js Lab did not load');
    if (target === 'filter') {
      const r = build(g, 'filter');
      const res = await D.addLayer({ name: `${name} (filter)`, code: r.code }, 1);
      const L = findLabLayer(res?.added);
      return { bind: L ? { kind: 'layer', id: L.id, name: L.name } : { kind: 'none' }, text: `Added the filter layer “${res?.added || name}”: it restyles every layer below it.${errs(res)}`, report: res };
    }
    if (target === 'layer') {
      const r = build(g, 'layer');
      const res = await D.addLayer({ name, code: r.code }, 1);
      const L = findLabLayer(res?.added);
      return { bind: L ? { kind: 'layer', id: L.id, name: L.name } : { kind: 'none' }, text: `Added the layer “${res?.added || name}” (a full-screen shader that follows the song).${errs(res)}`, report: res };
    }
    if (target === 'sketch') {
      const r = build(g, 'layer');
      await D.newSketch(name, r.code, 1);
      const L = findLabLayer(null);
      return { bind: L ? { kind: 'layer', id: L.id, name: L.name } : { kind: 'none' }, text: `New Lab sketch “${name}”.` };
    }
    throw new Error(`Send to playground, filter, layer, sketch, shadertoy or copy (not "${target}").`);
  }
  const errs = (res) => (res?.errors?.length ? `\nThe Lab reports: ${res.errors.map((e) => `${e.layer ? `[${e.layer}] ` : ''}${e.message}`).join('; ')}` : '');
  // the layer just added is the selected one: its id from the Lab's code-pane hook, else its name
  function findLabLayer(name) {
    try {
      const sel = labHook?.layer?.();
      if (sel && (!name || sel.name === name)) return { id: sel.id, name: sel.name };
      const n = name || ThreeLab.director.layers()?.selected;
      return n ? { id: n, name: n } : null;
    } catch { return null; }
  }
  // the Lab's code-pane hook (tools/three-nodes.js hands it over when the Lab mounts)
  let labHook = null;

  // ---------- one line → text (chat commands) ----------
  const ref = (s) => String(s || '').split('.');
  const parseValue = (v) => {
    if (/^(true|on|yes)$/i.test(v)) return true;
    if (/^(false|off|no)$/i.test(v)) return false;
    if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(v)) return Number(v);
    if (/^\[.*\]$/.test(v)) { try { return JSON.parse(v); } catch { /* text */ } }
    return v.replace(/^['"]|['"]$/g, '');
  };
  const pairs = (s) => [...String(s || '').matchAll(/([\w]+)=("[^"]*"|'[^']*'|\[[^\]]*\]|\S+)/g)].map((m) => [m[1], parseValue(m[2])]);
  function summary(graph) {
    const g = NodeView.normalize(graph, reg);
    if (!g.nodes.length) return 'The graph is empty.';
    return g.nodes.map((n) => {
      const d = reg.get(n.type);
      const changed = Object.entries(n.values).filter(([k, v]) => { const f = d.fields.find((x) => x.name === k); return f && JSON.stringify(f.value) !== JSON.stringify(v); }).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
      const ins = g.links.filter((l) => l.to[0] === n.id).map((l) => `${l.to[1]}←${l.from[0]}.${l.from[1]}`);
      return `- ${n.id} (${d.title})${n.bypass ? ' [bypassed]' : ''}${changed.length ? ` ${changed.join(' ')}` : ''}${ins.length ? ` · ${ins.join(', ')}` : ''}`;
    }).join('\n');
  }
  function typeList(filter = '') {
    const q = filter.toLowerCase();
    const by = new Map();
    for (const d of reg.list()) {
      if (q && !`${d.type} ${d.title} ${d.category} ${d.keywords || ''}`.toLowerCase().includes(q)) continue;
      if (!by.has(d.category)) by.set(d.category, []);
      by.get(d.category).push(q ? `${d.type} (in: ${d.inputs.map((f) => f.name).join(', ') || '–'}; out: ${d.outputs.map((o) => o.name).join(', ') || '–'})` : d.type);
    }
    return [...by].map(([c, list]) => `**${c}**: ${list.join(', ')}`).join('\n') || `No node type matches "${filter}".`;
  }
  const need = () => ui || open();
  async function run(line) {
    const [verb, ...rest] = String(line || '').trim().split(/\s+/);
    const args = rest.join(' ');
    const v = (verb || 'open').toLowerCase();
    if (v === 'presets') return PRESETS.filter((p) => !args || `${p.id} ${p.name} ${p.tags || ''}`.toLowerCase().includes(args.toLowerCase())).map((p) => `- \`${p.id}\` ${p.name}${p.filter ? ' (filter layer)' : ''}: ${p.desc}`).join('\n');
    if (v === 'types') return typeList(args);
    if (v === 'open') {
      if (args === 'playground') { open({ bind: { kind: 'playground' } }); return null; }
      open();
      return null;
    }
    if (v === 'new') {
      const p = findPreset(args || 'plasma');
      if (!p) throw new Error(`No shader preset "${args}". See /shader-nodes-presets.`);
      const u = ui || open({ presetId: p.id });
      if (u.view.getGraph().meta?.preset !== p.id) u.usePreset(p.id);
      if (p.filter && u.bind.kind === 'playground') u.bind = { kind: 'none' };
      u.refreshBind();
      return `Shader graph “${p.name}”${p.filter ? ' (a filter: /shader-nodes-to filter adds it to the Lab)' : ''}.\n${summary(u.view.getGraph())}`;
    }
    if (v === 'to' || v === 'send') {
      const r = await send(args || 'playground', ui?.view.getGraph());
      if (ui && r.bind) { ui.bind = r.bind; ui.refreshBind(); }
      return r.text;
    }
    if (v === 'code') {
      const g = ui ? ui.view.getGraph() : NodeView.normalize(store.get(GRAPH_KEY, null) || buildPreset(findPreset('plasma')), reg);
      const target = TARGETS[args] ? args : 'playground';
      const r = build(g, target, { embedGraph: false });
      return `\`\`\`${target === 'layer' || target === 'sketch' || target === 'filter' ? 'js' : 'glsl'}\n${r.code}\n\`\`\``;
    }
    const u = need();
    const view = u.view;
    if (v === 'list') return summary(view.getGraph());
    if (v === 'layout') { view.layout(); view.fit(); return null; }
    if (v === 'undo') { view.undo(); return null; }
    if (v === 'apply') { await u.apply(true); return null; }
    if (v === 'add') {
      const [type, ...kv] = args.split(/\s+/);
      const d = reg.get(type) || reg.list().find((x) => x.title.toLowerCase() === String(type).toLowerCase()) || reg.list().find((x) => `${x.type} ${x.title}`.toLowerCase().includes(String(type).toLowerCase()));
      if (!d) throw new Error(`No shader node "${type}". See /shader-nodes-types.`);
      const vals = Object.fromEntries(pairs(kv.join(' ')));
      const to = vals.to; delete vals.to;
      const id = view.addNode(d.type, { values: vals });
      if (to) {
        const [tid, tport] = ref(to);
        const tn = view.getGraph().nodes.find((n) => n.id === tid);
        const tf = reg.get(tn?.type)?.inputs.find((f) => f.name === tport);
        const o = tf && d.outputs.find((x) => reg.compatible(x.type, tf.type));
        if (o) view.connect(id, o.name, tid, tport);
      }
      return `Added ${id} (${d.title}). Inputs: ${d.inputs.map((f) => f.name).join(', ') || '–'}; outputs: ${d.outputs.map((o) => o.name).join(', ') || '–'}.`;
    }
    if (v === 'link') {
      const [a, b] = args.split(/\s+|→|->/).filter(Boolean);
      const [x, xp] = ref(a); const [y, yp] = ref(b);
      if (!view.connect(x, xp, y, yp)) throw new Error(`Could not connect ${a} to ${b} (check /shader-nodes-list and the types).`);
      return `Connected ${a} → ${b}.`;
    }
    if (v === 'unlink') { const [y, yp] = ref(args); view.disconnect(y, yp || null); return `Disconnected ${args}.`; }
    if (v === 'set') {
      const [id, ...kv] = args.split(/\s+/);
      const done = pairs(kv.join(' ')).filter(([k, val]) => view.setValue(id, k, val)).map(([k]) => k);
      if (!done.length) throw new Error(`Nothing set on ${id}. Fields: ${reg.get(view.getGraph().nodes.find((n) => n.id === id)?.type)?.fields.map((f) => f.name).join(', ') || '(no such node)'}`);
      return `Set ${done.map((k) => `${id}.${k}`).join(', ')}.`;
    }
    if (v === 'rm') { const ids = args.split(/[\s,]+/).filter(Boolean); view.removeNodes(ids); return `Removed ${ids.join(', ')}.`; }
    if (v === 'bypass') { const ids = args.split(/[\s,]+/).filter(Boolean); view.bypass(ids); return `Toggled bypass on ${ids.join(', ')}.`; }
    throw new Error(`Unknown: ${verb}. Try open, new, presets, types, list, add, link, unlink, set, rm, bypass, layout, to, code, apply.`);
  }

  // ---------- chat commands, palette, adapter ----------
  const area = 'Shader nodes';
  const presetComplete = (a) => PRESETS.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(String(a).toLowerCase())).slice(0, 16).map((p) => ({ value: p.id, label: p.name, hint: p.filter ? `filter · ${p.desc}` : p.desc }));
  const nodeIds = (a) => (ui ? ui.view.getGraph().nodes.map((n) => n.id).filter((id) => id.startsWith(a)).map((id) => ({ value: `${id} ` })) : []);
  if (typeof Commands !== 'undefined') {
    const cmd = (name, o) => { if (Commands.get(name)) return; Commands.register({ name, area, ...o, run: async (args) => (await run(`${o.verb} ${args}`)) || undefined }); };
    cmd('shader-nodes', { verb: 'open', args: '[playground]', desc: 'Open the shader node editor (GLSL as nodes, live preview)', complete: () => [{ value: 'playground', hint: 'linked to the shader playground' }] });
    cmd('shader-nodes-new', { verb: 'new', args: '<preset>', desc: 'Start a shader graph from a preset (plasma, tunnel, voronoi, nebula, filters…)', complete: presetComplete });
    cmd('shader-nodes-presets', { verb: 'presets', args: '[filter]', desc: 'List the shader presets' });
    cmd('shader-nodes-types', { verb: 'types', args: '[filter]', desc: 'List the shader node types (with a filter: inputs and outputs)' });
    cmd('shader-nodes-list', { verb: 'list', desc: 'The open shader graph: nodes, changed values, wires' });
    cmd('shader-nodes-add', { verb: 'add', args: '<type> [field=value…] [to=node.input]', desc: 'Add a shader node (to= wires it in)', complete: (a) => reg.list().filter((d) => d.type.startsWith(a.toLowerCase()) || d.title.toLowerCase().includes(a.toLowerCase())).slice(0, 16).map((d) => ({ value: d.type, label: d.title, hint: d.category })) });
    cmd('shader-nodes-link', { verb: 'link', args: '<node.output> <node.input>', desc: 'Wire two shader nodes', complete: (a) => nodeIds(a).map((x) => ({ value: x.value.trim() + '.' })) });
    cmd('shader-nodes-unlink', { verb: 'unlink', args: '<node.input>', desc: 'Remove the wires into a shader node input' });
    cmd('shader-nodes-set', { verb: 'set', args: '<node> field=value…', desc: 'Set shader node values (numbers, #colors, options)', complete: nodeIds });
    cmd('shader-nodes-rm', { verb: 'rm', args: '<node…>', desc: 'Delete shader nodes', complete: nodeIds });
    cmd('shader-nodes-bypass', { verb: 'bypass', args: '<node…>', desc: 'Bypass (skip) shader nodes or bring them back', complete: nodeIds });
    cmd('shader-nodes-layout', { verb: 'layout', desc: 'Tidy the shader graph into columns' });
    cmd('shader-nodes-undo', { verb: 'undo', desc: 'Undo the last shader node edit' });
    cmd('shader-nodes-apply', { verb: 'apply', desc: 'Write the shader to its target (playground or Lab layer)' });
    cmd('shader-nodes-to', { verb: 'to', args: 'playground|filter|layer|sketch|shadertoy|copy', desc: 'Send the shader graph to the playground, a new Lab filter layer / layer / sketch, or copy it', complete: () => ['playground', 'filter', 'layer', 'sketch', 'shadertoy', 'copy'].map((value) => ({ value })) });
    cmd('shader-nodes-code', { verb: 'code', args: '[playground|filter|layer|shadertoy]', desc: 'The GLSL (or Lab code) the shader graph makes, in the chat', complete: () => Object.keys(TARGETS).map((value) => ({ value, hint: TARGETS[value] })) });
  }
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Shader nodes: open the editor', () => open());
    AppUI.addAction('Shader nodes: presets…', () => open().presetPicker());
  }
  // GLSL (or Lab code) carrying a shader graph opens here; the playground code stays linked to the playground
  NodeView.registerAdapter({
    id: 'shader', label: 'Shader nodes', kinds: ['shader'], priority: 5,
    detect: () => false,
    open: (code, lang, graph) => open({ graph: NodeView.normalize(graph, reg), bind: /glsl|frag|shader/i.test(lang || '') || /void\s+main|mainImage/.test(code) && !/import\s/.test(code) ? { kind: 'playground' } : { kind: 'none' } }),
  });
  // The playground's toolbar gets a small "Nodes" button (called by tools/three.js when the shader tab is built)
  function attachPlayground(pane, { editor } = {}) {
    const bar = pane.querySelector('.three-toolbar');
    if (!bar || bar.querySelector('.sg-open')) return;
    const b = el('button', { class: 'ghost small sg-open', text: '◇ Nodes', title: 'Edit shaders as nodes and wires (/shader-nodes): uv, time, music, noise, shapes, palettes…', dataset: { feature: 'Shader nodes' } });
    b.addEventListener('click', () => {
      const hit = NodeView.extract(editor?.value || '');
      if (hit?.graph?.kind === 'shader') open({ graph: NodeView.normalize(hit.graph, reg), bind: { kind: 'playground' } });
      else open({ bind: { kind: 'playground' } });
    });
    bar.insertBefore(b, bar.children[2] || null);
  }
  // A Lab layer made with shader nodes (tools/three-nodes.js asks): edit it here, writing back to that layer
  function editLabLayer(code, hook) {
    labHook = hook;
    const hit = NodeView.extract(code);
    if (!hit || hit.graph.kind !== 'shader') return null;
    const L = hook?.layer?.();
    return open({ graph: NodeView.normalize(hit.graph, reg), bind: L ? { kind: 'layer', id: L.id, name: L.name } : { kind: 'none' } });
  }

  const api = {
    registry: reg, build, previewSource, presets: () => PRESETS.map(({ id, name, desc, filter }) => ({ id, name, desc, filter: Boolean(filter) })), buildPreset: (id) => buildPreset(findPreset(id)),
    open, send, run, summary, attachPlayground, editLabLayer, TARGETS, get ui() { return ui; },
    setLabHook: (h) => { labHook = h; },
  };
  window.ShaderNodes = api;
  return api;
})();
