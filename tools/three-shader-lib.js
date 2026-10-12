// The shader workbench's text side (round 23, labshader): no DOM, usable by the hub, the director's tool and the
// checks. A ◇ shader layer is plain layer code the sandbox runs (tools/three-sandbox.html "shader layers"):
//   const P = tweak({ uGlow: { value: 1, min: 0, max: 2, label: 'Glow', group: 'Shader' } }); // ◇ sliders from the uniforms
//   const bufferA = /* glsl */ `…`;
//   shader(/* glsl */ `…mainImage…`, P, { buffers: { A: { code: bufferA, iChannel0: 'A' } }, iChannel0: 'A' });
// The tweak() line is written from the GLSL's `uniform float uGlow; // [Group] 0..2, 1 Label` lines on each run
// (syncCode), keeping the values you saved; everything else is yours to edit. Imports: a Shadertoy paste (one Image
// tab, several tabs with "// Buffer A" headers, or the JSON export) and ISF (.fs with its JSON header).
const ShaderLib = (() => {
  const MARK = '// ◇ sliders from the uniforms';
  const LINE_RE = /^const P = tweak\(\{.*\}\);[ \t]*\/\/ ◇[^\n]*$/m;
  const BUILTIN = new Set(['iResolution', 'iTime', 'iTimeDelta', 'iFrameRate', 'iFrame', 'iMouse', 'iDate', 'iSampleRate', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'iChannelResolution', 'iChannelTime',
    'uKick', 'uSnare', 'uHats', 'uHit', 'uBeat', 'uBass', 'uMid', 'uTreble', 'uLevel', 'uDrop', 'uEnergy', 'uBeatPhase', 'uBarPhase', 'uBands', 'uPrev', 'uBelow', 'uAudio', 'vUv']);
  const UNI_RE = /^[ \t]*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(float|int|bool|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*;([^\n]*)/gm;
  const SOURCES = ['audio', 'self', 'A', 'B', 'C', 'D', 'below', 'noise', 'none'];
  const SOURCE_HINT = { audio: 'the sound: spectrum (y 0.25) + waveform (y 0.75)', self: 'this pass\'s previous frame (feedback)', A: 'Buffer A', B: 'Buffer B', C: 'Buffer C', D: 'Buffer D', below: 'the layers under this one', noise: 'a 256² noise texture', none: 'black' };
  const isShader = (code) => /(^|[^.\w])shader\s*\(/m.test(String(code || '')) && /\/\*\s*glsl\s*\*\/|mainImage|gl_FragColor|void\s+main/.test(String(code || ''));
  const labelOf = (name) => { const n = String(name).replace(/^u(?=[A-Z])/, '').replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2'); return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase(); };
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const fmtNum = (n) => { const x = Math.round(Number(n) * 10000) / 10000; return Number.isFinite(x) ? String(x) : '0'; };
  const hex6 = (h) => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]; return `#${s.toLowerCase()}`; };
  const rgbHex = (a) => `#${a.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(Number(v) * 255))).toString(16).padStart(2, '0')).join('')}`;

  // ---------- uniforms → sliders ----------
  // hint: `// [Group] min..max[, default][ step s] Label words` · `// #rrggbb Label` · `// on Label` · `// options: a, b`
  // · a vec2: `// 0..1 = x y Label` (two sliders key_x / key_y and an XY pad in the workbench)
  function parseHint(kind, hint = '') {
    let h = String(hint).replace(/^\s*\/\/\s*/, '').replace(/^\s*\/\*|\*\/\s*$/g, '').trim();
    const out = { group: null, min: null, max: null, def: null, def2: null, step: null, options: null, hex: null, on: null, label: null };
    h = h.replace(/\[([^\]]+)\]/, (_, g) => { out.group = g.trim(); return ' '; });
    h = h.replace(/options?\s*:\s*([^\n]+)$/i, (_, o) => { out.options = o.split(/[,|]/).map((x) => x.trim()).filter(Boolean); return ' '; });
    h = h.replace(/(-?\d*\.?\d+)\s*\.\.\s*(-?\d*\.?\d+)(?:\s*(?:,|=)\s*(-?\d*\.?\d+)(?:\s*,?\s+(-?\d*\.?\d+))?)?/, (_, a, b, d, d2) => { out.min = Number(a); out.max = Number(b); if (d != null) out.def = Number(d); if (d2 != null) out.def2 = Number(d2); return ' '; });
    h = h.replace(/^\s*=\s*(-?\d*\.?\d+)(?:\s*,?\s+(-?\d*\.?\d+))?/, (_, d, d2) => { out.def = Number(d); if (d2 != null) out.def2 = Number(d2); return ' '; });
    h = h.replace(/\bstep\s+(-?\d*\.?\d+)/i, (_, s) => { out.step = Number(s); return ' '; });
    h = h.replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i, (m) => { out.hex = hex6(m); return ' '; });
    h = h.replace(/^\s*(on|off|true|false)\b/i, (_, b) => { out.on = /on|true/i.test(b); return ' '; });
    h = h.replace(/^\s*(pad|xy)\b/i, ' ');
    const label = h.replace(/\s+/g, ' ').replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '');
    if (label) out.label = label.slice(0, 40);
    return out;
  }
  function parseUniforms(texts) {
    const seen = new Map();
    for (const t of [].concat(texts)) {
      if (!t) continue;
      for (const m of String(t).matchAll(UNI_RE)) if (!BUILTIN.has(m[2]) && !seen.has(m[2])) seen.set(m[2], { kind: m[1], name: m[2], hint: parseHint(m[1], m[3] || '') });
    }
    return [...seen.values()];
  }
  // → [{ key, spec: { value, min, max, step?, options?, label, group }, kind: number|color|bool|choice, of }]
  function controlsOf(uniforms) {
    const out = [];
    for (const u of uniforms) {
      const h = u.hint; const label = h.label || labelOf(u.name); const group = h.group || 'Shader';
      if (u.kind === 'sampler2D') continue;
      if (u.kind === 'bool') { out.push({ key: u.name, kind: 'bool', of: u.name, spec: { value: h.on ?? false, label, group } }); continue; }
      if ((u.kind === 'int' || u.kind === 'float') && h.options?.length) { out.push({ key: u.name, kind: 'choice', of: u.name, spec: { value: h.options[Math.max(0, Math.min(h.options.length - 1, Math.round(h.def ?? 0)))], options: h.options, label, group } }); continue; }
      if (u.kind === 'vec3' || u.kind === 'vec4') {
        if (h.min != null && !h.hex) { for (const ax of ['x', 'y', 'z']) out.push({ key: `${u.name}_${ax}`, kind: 'number', of: u.name, spec: { value: h.def ?? (h.min + h.max) / 2, min: h.min, max: h.max, label: `${label} ${ax}`, group } }); continue; }
        out.push({ key: u.name, kind: 'color', of: u.name, spec: { value: h.hex || '#ffffff', label, group } }); continue;
      }
      const min = h.min ?? 0; const max = h.max ?? (u.kind === 'int' ? 10 : 1);
      const def = h.def ?? (min + max) / 2;
      if (u.kind === 'vec2') {
        out.push({ key: `${u.name}_x`, kind: 'number', of: u.name, pad: 'x', spec: { value: def, min, max, label: `${label} x`, group } });
        out.push({ key: `${u.name}_y`, kind: 'number', of: u.name, pad: 'y', spec: { value: h.def2 ?? def, min, max, label: `${label} y`, group } });
        continue;
      }
      const spec = { value: u.kind === 'int' ? Math.round(def) : def, min, max, label, group };
      if (u.kind === 'int') spec.step = 1; else if (h.step) spec.step = h.step;
      out.push({ key: u.name, kind: 'number', of: u.name, spec });
    }
    return out;
  }
  // the values already in a tweak line: key → its value's literal (kept when the control is still the same kind)
  function lineValues(line) {
    const out = {};
    for (const m of String(line || '').matchAll(/(\w+):\s*\{\s*value:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|true|false|-?\d*\.?\d+(?:e[+-]?\d+)?)/gi)) out[m[1]] = m[2];
    return out;
  }
  const litKind = (lit) => (/^['"]#[0-9a-f]{3,6}['"]$/i.test(lit) ? 'color' : /^(true|false)$/.test(lit) ? 'bool' : /^['"]/.test(lit) ? 'choice' : 'number');
  function sliderLine(controls, old = '') {
    const keep = lineValues(old);
    const parts = controls.map((c) => {
      const s = c.spec; const lit = keep[c.key];
      const value = lit != null && litKind(lit) === c.kind && (c.kind !== 'choice' || s.options.includes(lit.slice(1, -1))) ? lit : typeof s.value === 'string' ? q(s.value) : typeof s.value === 'boolean' ? String(s.value) : fmtNum(s.value);
      const bits = [`value: ${value}`];
      if (s.min != null) bits.push(`min: ${fmtNum(s.min)}`, `max: ${fmtNum(s.max)}`);
      if (s.step != null) bits.push(`step: ${fmtNum(s.step)}`);
      if (s.options) bits.push(`options: [${s.options.map(q).join(', ')}]`);
      bits.push(`label: ${q(s.label)}`, `group: ${q(s.group)}`);
      return `${c.key}: { ${bits.join(', ')} }`;
    });
    return `const P = tweak({${parts.length ? ` ${parts.join(', ')} ` : ''}}); ${MARK}`;
  }
  // the GLSL texts inside a layer's code (template literals that look like GLSL), with where they start
  function glslBlocks(code) {
    const out = [];
    const s = String(code || '');
    const re = /(?:const\s+(\w+)\s*=\s*)?(?:\/\*\s*glsl\s*\*\/\s*)?`((?:\\[\s\S]|[^`\\])*)`/g;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (!/\b(void\s+main|mainImage|uniform|gl_FragColor|fragColor)\b/.test(m[2])) continue;
      const start = m.index + m[0].indexOf('`') + 1;
      out.push({ name: m[1] || null, text: m[2], start, end: start + m[2].length });
    }
    return out;
  }
  // the code with its ◇ tweak line written from the uniforms (the same code when nothing changed)
  function syncCode(code) {
    const s = String(code || '');
    if (!isShader(s)) return s;
    const ctl = controlsOf(parseUniforms(glslBlocks(s).map((b) => b.text)));
    const m = LINE_RE.exec(s);
    if (!m) {
      // (no ◇ line: one is added only when the code reads P and has no tweak() of its own)
      if (/\btweak\s*\(/.test(s) || !/shader\s*\([^]*?,\s*P\b/.test(s)) return s;
      return `${sliderLine(ctl)}\n${s}`;
    }
    const line = sliderLine(ctl, m[0]);
    return line === m[0] ? s : s.slice(0, m.index) + line + s.slice(m.index + m[0].length);
  }

  // ---------- the opts object of shader(…, P, { … }): a tiny parser for that literal (identifiers stay names) ----------
  function parseLit(text) {
    let i = 0; const s = String(text);
    const ws = () => { for (;;) { while (/\s/.test(s[i] || '')) i += 1; if (s.startsWith('//', i)) { while (i < s.length && s[i] !== '\n') i += 1; } else if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; } else return; } };
    const val = () => {
      ws();
      const c = s[i];
      if (c === '{') {
        i += 1; const o = {};
        for (;;) { ws(); if (s[i] === '}') { i += 1; return o; } let k; if (s[i] === "'" || s[i] === '"') k = str(); else { const m = /^[\w$]+/.exec(s.slice(i)); if (!m) throw new Error(`bad key at ${i}`); k = m[0]; i += k.length; } ws(); if (s[i] !== ':') { o[k] = { $ref: k }; } else { i += 1; o[k] = val(); } ws(); if (s[i] === ',') i += 1; }
      }
      if (c === '[') { i += 1; const a = []; for (;;) { ws(); if (s[i] === ']') { i += 1; return a; } a.push(val()); ws(); if (s[i] === ',') i += 1; } }
      if (c === "'" || c === '"') return str();
      if (c === '`') { const e = s.indexOf('`', i + 1); const t = s.slice(i + 1, e); i = e + 1; return t; }
      const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?|true|false|null|[\w$.]+)/i.exec(s.slice(i));
      if (!m) throw new Error(`can't read the shader options at ${i}`);
      i += m[0].length;
      if (/^-?\d|^-?\./.test(m[0])) return Number(m[0]);
      if (m[0] === 'true' || m[0] === 'false') return m[0] === 'true';
      if (m[0] === 'null') return null;
      return { $ref: m[0] };
    };
    const str = () => { const qc = s[i]; let out = ''; i += 1; while (i < s.length && s[i] !== qc) { if (s[i] === '\\') { out += s[i + 1]; i += 2; } else { out += s[i]; i += 1; } } i += 1; return out; };
    return val();
  }
  function fmtLit(v) {
    if (v && typeof v === 'object' && v.$ref) return v.$ref;
    if (Array.isArray(v)) return `[${v.map(fmtLit).join(', ')}]`;
    if (v && typeof v === 'object') { const e = Object.entries(v).filter(([, x]) => x !== undefined); return e.length ? `{ ${e.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)}: ${fmtLit(x)}`).join(', ')} }` : '{}'; }
    if (typeof v === 'string') return q(v);
    if (typeof v === 'number') return fmtNum(v);
    return String(v);
  }
  // where the shader( call's arguments sit: { image: {start, end} (template content) | { ref }, opts: {start, end, value} | null, close }
  function callOf(code) {
    const s = String(code || '');
    const re = /(^|[^.\w])shader\s*\(/gm;
    const m = re.exec(s);
    if (!m) return null;
    let i = m.index + m[0].length;
    const ws = () => { for (;;) { while (/\s/.test(s[i] || '')) i += 1; if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; } else if (s.startsWith('//', i)) { while (i < s.length && s[i] !== '\n') i += 1; } else return; } };
    // skips one argument (template / string / balanced brackets) and returns its span
    const arg = () => {
      ws(); const a = i; let depth = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '`') { i += 1; while (i < s.length && s[i] !== '`') i += s[i] === '\\' ? 2 : 1; i += 1; continue; }
        if (c === "'" || c === '"') { i += 1; while (i < s.length && s[i] !== c && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1; i += 1; continue; }
        if (c === '(' || c === '[' || c === '{') depth += 1;
        if (c === ')' || c === ']' || c === '}') { if (!depth) break; depth -= 1; }
        if (c === ',' && !depth) break;
        i += 1;
      }
      let b = i; while (b > a && /\s/.test(s[b - 1])) b -= 1;
      return { start: a, end: b, text: s.slice(a, b) };
    };
    const first = arg(); if (s[i] === ',') i += 1;
    const second = s[i] === ')' ? null : arg(); if (s[i] === ',') i += 1;
    const third = s[i] === ')' ? null : arg();
    ws(); const close = i;
    const tm = /^(?:\/\*\s*glsl\s*\*\/\s*)?`/.exec(first.text);
    const image = tm ? { start: first.start + tm[0].length, end: first.end - 1 } : { ref: first.text.trim() };
    let opts = null;
    if (third && /^\{/.test(third.text)) { try { opts = { start: third.start, end: third.end, value: parseLit(third.text) }; } catch { opts = { start: third.start, end: third.end, value: null }; } }
    return { image, P: second?.text || null, opts, third, close, callStart: m.index + m[1].length };
  }
  // the template of `const <name> = /* glsl */ \`…\`` → { start, end } of its content
  function constTemplate(code, name) {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*(?:\\/\\*\\s*glsl\\s*\\*\\/\\s*)?\``);
    const m = re.exec(code);
    if (!m) return null;
    const start = m.index + m[0].length; let i = start;
    while (i < code.length && code[i] !== '`') i += code[i] === '\\' ? 2 : 1;
    return { start, end: i };
  }
  const unesc = (t) => t.replace(/\\([`$\\])/g, '$1');
  const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  // a shader layer's parts: { image, buffers: { A: { code, iChannel0… } }, common, opts (with code refs resolved), spans }
  function parseLayer(code) {
    const s = String(code || '');
    if (!isShader(s)) return null;
    const call = callOf(s);
    if (!call) return null;
    const textOf = (ref) => { if (!ref) return ''; if (typeof ref === 'string') return ref; const t = constTemplate(s, ref.$ref || ref); return t ? unesc(s.slice(t.start, t.end)) : ''; };
    const spanOf = (ref) => (ref && typeof ref === 'object' && ref.$ref ? constTemplate(s, ref.$ref) : null);
    const o = call.opts?.value || {};
    const image = call.image.ref ? textOf({ $ref: call.image.ref }) : unesc(s.slice(call.image.start, call.image.end));
    const buffers = {};
    for (const [name, b] of Object.entries(o.buffers || {})) {
      const conf = b && typeof b === 'object' && !b.$ref ? b : { code: b };
      buffers[name] = { ...conf, code: textOf(conf.code), span: spanOf(conf.code) };
    }
    const channels = { image: {} };
    for (const k of ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3']) if (typeof o[k] === 'string') channels.image[k] = o[k];
    for (const [name, b] of Object.entries(buffers)) { channels[name] = {}; for (const k of ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3']) if (typeof b[k] === 'string') channels[name][k] = b[k]; }
    return { image, imageSpan: call.image.ref ? constTemplate(s, call.image.ref) : { start: call.image.start, end: call.image.end }, buffers, common: textOf(o.common), commonSpan: spanOf(o.common), opts: o, channels, call, isf: Boolean(o.isf), scale: Number(o.scale) || 1, alpha: Boolean(o.alpha) };
  }
  // the code with its shader options changed by fn(opts) (the object stays a literal; code refs stay names)
  function setOpts(code, fn) {
    const s = String(code || '');
    const call = callOf(s);
    if (!call) throw new Error('No shader( call in this layer.');
    if (call.opts && !call.opts.value) throw new Error('The shader options aren\'t a plain object here: edit them in the code.');
    const o = call.opts ? call.opts.value : {};
    fn(o);
    const txt = fmtLit(o);
    if (call.opts) return s.slice(0, call.opts.start) + txt + s.slice(call.opts.end);
    if (!call.P) return `${s.slice(0, call.close)}, P, ${txt}${s.slice(call.close)}`;
    return `${s.slice(0, call.close)}, ${txt}${s.slice(call.close)}`;
  }
  // a pass's GLSL replaced: pass 'image' | a buffer name | 'common'
  function setPass(code, pass, glsl) {
    const s = String(code || ''); const L = parseLayer(s);
    if (!L) throw new Error('Not a shader layer.');
    const p = String(pass || 'image');
    const span = p === 'image' ? L.imageSpan : p === 'common' ? L.commonSpan : L.buffers[p]?.span || L.buffers[p.replace(/^buffer\s*/i, '').toUpperCase()]?.span;
    const body = `\n${String(glsl).trim()}\n`;
    if (span) return s.slice(0, span.start) + esc(body) + s.slice(span.end);
    // a new buffer / common: its own const above the shader( call, and in the options
    const name = p === 'common' ? 'common' : `buffer${p.replace(/^buffer\s*/i, '').toUpperCase()}`;
    const key = p.replace(/^buffer\s*/i, '').toUpperCase();
    const at = L.call.callStart;
    const withConst = `${s.slice(0, at)}const ${name} = /* glsl */ \`${esc(body)}\`;\n${s.slice(at)}`;
    return setOpts(withConst, (o) => { if (p === 'common') o.common = { $ref: 'common' }; else { o.buffers ||= {}; o.buffers[key] = { code: { $ref: name }, iChannel0: key }; } });
  }

  // ---------- making layer code ----------
  // spec: { name, image, buffers: { A: { code, iChannel0…, scale } }, common, channels: { iChannel0… } (the image's),
  //         scale, alpha, isf, pass, textures }
  function layerCode(spec = {}) {
    const name = spec.name || 'Shader';
    const texts = [spec.common, spec.image, ...Object.values(spec.buffers || {}).map((b) => (typeof b === 'string' ? b : b.code))];
    const lines = [
      `// ◇ ${name}: a fragment-shader layer. Edit the GLSL: it compiles as you pause typing (an error shows on its line and`,
      "// the last version that compiled keeps drawing). 'uniform float uGlow; // [Group] 0..2, 1 Label' lines are the sliders.",
      '// Built in: iTime (the scene\'s clock) iResolution iMouse iFrame iChannel0–3, uKick uBass uBeat uLevel… · /shader help',
      sliderLine(controlsOf(parseUniforms(texts))),
    ];
    const o = {};
    if (spec.isf) {
      lines.push(`const isf = /* glsl */ \`\n${esc(String(spec.image).trim())}\n\`;`);
      o.isf = true;
      if (spec.buffers && Object.keys(spec.buffers).length) o.buffers = Object.fromEntries(Object.entries(spec.buffers).map(([k, b]) => [k, { code: { $ref: 'isf' }, ...Object.fromEntries(Object.entries(b).filter(([x]) => x !== 'code')) }]));
      if (spec.pass != null) o.pass = spec.pass;
    } else {
      if (spec.common) { lines.push(`const common = /* glsl */ \`\n${esc(String(spec.common).trim())}\n\`;`); o.common = { $ref: 'common' }; }
      for (const [k, b] of Object.entries(spec.buffers || {})) {
        const conf = typeof b === 'string' ? { code: b } : b;
        lines.push(`const buffer${k} = /* glsl */ \`\n${esc(String(conf.code).trim())}\n\`;`);
        (o.buffers ||= {})[k] = { code: { $ref: `buffer${k}` }, ...Object.fromEntries(Object.entries(conf).filter(([x]) => x !== 'code')) };
      }
    }
    Object.assign(o, spec.channels || {});
    if (spec.textures && Object.keys(spec.textures).length) o.textures = spec.textures;
    if (spec.scale && spec.scale !== 1) o.scale = spec.scale;
    if (spec.alpha) o.alpha = true;
    const optsTxt = Object.keys(o).length ? `, ${fmtLit(o)}` : '';
    lines.push(spec.isf ? `shader(isf, P${optsTxt});` : `shader(/* glsl */ \`\n${esc(String(spec.image).trim())}\n\`, P${optsTxt});`);
    return `${lines.join('\n')}\n`;
  }
  const STARTERS = () => (typeof ShaderData !== 'undefined' ? ShaderData.STARTERS : []);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  function starter(q0) {
    const w = norm(q0);
    if (!w) return null;
    const L = STARTERS();
    return L.find((s) => s.id === q0 || norm(s.id) === w || norm(s.name) === w) || L.find((s) => norm(s.name).startsWith(w) || norm(s.id).startsWith(w)) || L.find((s) => norm(`${s.name} ${s.cat} ${s.desc}`).includes(w)) || null;
  }
  const starterCode = (st, name) => layerCode({ name: name || st.name, image: st.image, buffers: st.buffers, common: st.common, channels: st.channels, alpha: st.alpha });

  // ---------- imports ----------
  const ST_IDS = { '4dXGR8': 'A', XsXGR8: 'B', '4sXGR8': 'C', XdfGR8: 'D', 257: 'A', 258: 'B', 259: 'C', 260: 'D' };
  function chanWord(w, here) {
    const s = String(w).toLowerCase().trim();
    const b = /^buf(?:fer)?\s*([a-d])\b/.exec(s);
    if (b) return b[1].toUpperCase();
    if (/^(self|feedback|itself|previous)/.test(s)) return here && here !== 'image' ? here : 'self';
    if (/^(audio|music|sound|mic|soundcloud|fft)/.test(s)) return 'audio';
    if (/^(below|webcam|video|camera|layers?)/.test(s)) return 'below';
    if (/^(noise|texture|rgba|gray|organic|abstract|lichen|rock|wood|stars)/.test(s)) return 'noise';
    if (/^(keyboard|none|black|empty)/.test(s)) return 'none';
    if (/^(layer|ref):/.test(s)) return String(w).trim();
    return null;
  }
  // iChannel → source for a pass: what its comments say, else the defaults for what it reads
  function channelsFor(code, here, letters, said = {}) {
    const used = new Set([...String(code).matchAll(/\biChannel([0-3])\b/g)].map((m) => Number(m[1])));
    const out = {};
    for (const m of String(code).matchAll(/iChannel([0-3])\s*(?::|=|->|→|\bis\b|\bfrom\b)\s*(?:the\s+)?([\w:. -]{2,20})/gi)) { const v = chanWord(m[2], here); if (v && !(`iChannel${m[1]}` in out)) out[`iChannel${m[1]}`] = v; }
    for (const n of used) {
      const k = `iChannel${n}`;
      if (k in out) continue;
      if (said[k]) { out[k] = said[k]; continue; }
      out[k] = here === 'image' ? (letters[n] || ['below', 'audio', 'noise', 'self'][n]) : n === 0 ? here : (['', 'audio', 'noise', 'below'][n]);
    }
    return out;
  }
  // a Shadertoy paste → spec (+ notes: what was found, how the channels were mapped)
  function fromShadertoy(text, name = null) {
    const t = String(text || '').replace(/\r\n?/g, '\n');
    const notes = [];
    // the JSON export (shadertoy.com/api, "Export" browser add-ons): { Shader: { info, renderpass: […] } }
    if (/^\s*[[{]/.test(t)) {
      let j = null; try { j = JSON.parse(t); } catch { /* not JSON */ }
      const sh = j && (Array.isArray(j) ? j[0]?.Shader || j[0] : j.Shader || j);
      if (sh?.renderpass) {
        const outId = {};
        for (const rp of sh.renderpass) { const m = /buf(?:fer)?\s*([a-d])/i.exec(rp.name || ''); for (const o of rp.outputs || []) if (m) outId[o.id] = m[1].toUpperCase(); }
        const spec = { name: name || sh.info?.name || 'Shadertoy', image: '', buffers: {}, common: '' };
        for (const rp of sh.renderpass) {
          const type = String(rp.type || '').toLowerCase();
          if (type === 'common') { spec.common = rp.code; continue; }
          if (type === 'sound' || type === 'cubemap') { notes.push(`${rp.name || type} pass skipped (no ${type} passes here)`); continue; }
          const here = type === 'buffer' ? (/buf(?:fer)?\s*([a-d])/i.exec(rp.name || '')?.[1] || 'A').toUpperCase() : 'image';
          const ch = {};
          for (const inp of rp.inputs || []) {
            const ty = String(inp.type || inp.ctype || '').toLowerCase();
            const src = ty === 'buffer' ? (outId[inp.id] || ST_IDS[inp.id] || 'A') : /music|mic|sound/.test(ty) ? 'audio' : /webcam|video/.test(ty) ? 'below' : ty === 'texture' ? 'noise' : 'none';
            ch[`iChannel${inp.channel}`] = src;
          }
          if (here === 'image') { spec.image = rp.code; spec.channels = ch; } else spec.buffers[here] = { code: rp.code, ...ch };
        }
        notes.push(`Shadertoy JSON: ${Object.keys(spec.buffers).length ? `Buffer ${Object.keys(spec.buffers).join(', ')} → ` : ''}Image${spec.common ? ' (+ Common)' : ''}`);
        return { spec, notes };
      }
    }
    // tabs pasted one after the other, each under a "// Buffer A" / "// Image" / "// Common" line
    const HEAD = /^\s*\/\/+\s*[-=#*~\s]*(common|image|buf(?:fer)?\s*([a-d]))\s*(?:tab|pass)?\s*:?\s*[-=#*~\s]*$/i;
    const parts = []; let cur = { kind: 'image', lines: [] }; let found = false;
    for (const ln of t.split('\n')) {
      const m = HEAD.exec(ln);
      if (m) { if (cur.lines.join('').trim()) parts.push(cur); cur = { kind: m[2] ? m[2].toUpperCase() : m[1].toLowerCase(), lines: [] }; found = true; continue; }
      cur.lines.push(ln);
    }
    if (cur.lines.join('').trim()) parts.push(cur);
    const spec = { name: name || /\/\/\s*(?:title|name)\s*:\s*([^\n]+)/i.exec(t)?.[1]?.trim() || 'Shadertoy', image: '', buffers: {}, common: '' };
    if (!found) parts.length = 0, parts.push({ kind: 'image', lines: t.split('\n') });
    const letters = parts.filter((p) => /^[A-D]$/.test(p.kind)).map((p) => p.kind).sort();
    for (const p of parts) {
      const code = p.lines.join('\n').trim();
      if (p.kind === 'common') spec.common = code;
      else if (p.kind === 'image') spec.image = code;
      else spec.buffers[p.kind] = { code };
    }
    if (!spec.image && letters.length) { spec.image = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(texture(iChannel0, fragCoord / iResolution.xy).rgb, 1.0);\n}'; notes.push('No Image tab: the image shows Buffer A'); }
    spec.channels = channelsFor(spec.image, 'image', letters);
    for (const k of Object.keys(spec.buffers)) Object.assign(spec.buffers[k], channelsFor(spec.buffers[k].code, k, letters));
    const say = (ch) => Object.entries(ch).filter(([x]) => /^iChannel/.test(x)).map(([x, v]) => `${x.replace('iChannel', 'ch')}=${v}`).join(' ');
    notes.push(`${letters.length ? `Buffer ${letters.join(', ')} → ` : ''}Image${spec.common ? ' (+ Common)' : ''}`);
    for (const k of letters) if (say(spec.buffers[k])) notes.push(`Buffer ${k}: ${say(spec.buffers[k])}`);
    if (say(spec.channels)) notes.push(`Image: ${say(spec.channels)}`);
    if (!/\bmainImage\s*\(/.test(spec.image) && !/\bvoid\s+main\s*\(/.test(spec.image)) notes.push('No mainImage() or main() found: is this GLSL?');
    return { spec, notes };
  }
  // ISF (Interactive Shader Format: VDMX, Resolume, Millumin… .fs) → spec: its INPUTS become uniforms with slider hints
  function fromISF(text, name = null) {
    const t = String(text || '').replace(/\r\n?/g, '\n');
    const m = /\/\*\s*(\{[\s\S]*?\})\s*\*\//.exec(t);
    if (!m) throw new Error('No ISF header (a /*{ … }*/ JSON comment) in that text.');
    let j;
    try { j = JSON.parse(m[1]); } catch { try { j = JSON.parse(m[1].replace(/,\s*([}\]])/g, '$1')); } catch (err) { throw new Error(`The ISF header isn't valid JSON: ${err.message}`); } }
    const body = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).trim();
    const notes = []; const decl = []; const textures = {};
    let images = 0;
    for (const inp of j.INPUTS || []) {
      const n = inp.NAME; if (!n || !/^\w+$/.test(n)) continue;
      const lab = (inp.LABEL || '').replace(/[[\]\n]/g, ' ').trim();
      const ty = String(inp.TYPE || '').toLowerCase();
      if (ty === 'float') { const mn = inp.MIN ?? 0; const mx = inp.MAX ?? 1; decl.push(`uniform float ${n}; // ${fmtNum(mn)}..${fmtNum(mx)}, ${fmtNum(inp.DEFAULT ?? (mn + mx) / 2)} ${lab}`.trimEnd()); }
      else if (ty === 'long') { const labels = inp.LABELS || (inp.VALUES || []).map(String); const k = Math.max(0, (inp.VALUES || []).indexOf(inp.DEFAULT)); decl.push(`uniform int ${n}; // = ${k} ${lab} options: ${labels.join(', ')}`.replace(/\s+options/, ' options')); }
      else if (ty === 'bool' || ty === 'event') decl.push(`uniform bool ${n}; // ${inp.DEFAULT ? 'on' : 'off'} ${lab}`.trimEnd());
      else if (ty === 'color') decl.push(`uniform vec4 ${n}; // ${rgbHex(inp.DEFAULT || [1, 1, 1, 1])} ${lab}`.trimEnd());
      else if (ty === 'point2d') { const d = inp.DEFAULT || [0.5, 0.5]; const mx = Math.max(1, ...(inp.MAX || [1])); decl.push(`uniform vec2 ${n}; // ${fmtNum(Math.min(0, ...(inp.MIN || [0])))}..${fmtNum(mx)} = ${fmtNum(d[0])} ${fmtNum(d[1])} ${lab}`.trimEnd()); }
      else if (ty === 'image') { decl.push(`uniform sampler2D ${n};`); textures[n] = images++ ? 'noise' : 'below'; }
      else if (ty === 'audio' || ty === 'audiofft') { decl.push(`uniform sampler2D ${n};`); textures[n] = 'audio'; }
    }
    const passes = Array.isArray(j.PASSES) ? j.PASSES : [];
    const buffers = {};
    passes.forEach((p, i) => {
      if (!p?.TARGET || (i === passes.length - 1 && !passes.slice(0, -1).length)) return;
      if (i === passes.length - 1) return;
      const sc = /\/\s*(\d+)/.exec(String(p.WIDTH || ''))?.[1];
      buffers[p.TARGET] = { pass: i, ...(sc ? { scale: Math.round((1 / Number(sc)) * 1000) / 1000 } : {}) };
      decl.push(`uniform sampler2D ${p.TARGET};`);
    });
    const last = passes[passes.length - 1];
    if (last?.TARGET && !buffers[last.TARGET]) { decl.push(`uniform sampler2D ${last.TARGET};`); textures[last.TARGET] = 'self'; }
    const image = `${decl.join('\n')}\n${body}`;
    notes.push(`ISF${j.DESCRIPTION ? `: ${String(j.DESCRIPTION).slice(0, 60)}` : ''} · ${(j.INPUTS || []).length} inputs${passes.length > 1 ? ` · ${passes.length} passes` : ''}`);
    if (Object.values(textures).includes('below')) notes.push('Its image input reads the layers below (a filter layer)');
    if (/\bvv_|varying\s+vec2\s+(?!isf_)\w+/.test(body)) notes.push('It may need its own vertex shader (.vs): only the fragment part runs here');
    return { spec: { name: name || j.NAME || /\/\/\s*([^\n]+)/.exec(t)?.[1]?.trim()?.slice(0, 40) || 'ISF', image, isf: true, buffers, pass: passes.length > 1 ? passes.length - 1 : undefined, textures }, notes };
  }
  function detect(text) {
    const t = String(text || '');
    if (/\/\*\s*\{[\s\S]*?"(INPUTS|ISFVSN|DESCRIPTION|CATEGORIES)"[\s\S]*?\}\s*\*\//.test(t)) return 'isf';
    if (/^\s*[[{]/.test(t) && /renderpass/.test(t)) return 'shadertoy-json';
    if (/\bmainImage\s*\(/.test(t) || /\biChannel\d|\biTime\b|\biResolution\b/.test(t)) return 'shadertoy';
    if (/\bvoid\s+main\s*\(/.test(t)) return 'glsl';
    return null;
  }
  // any paste → { spec, kind, notes }
  function importText(text, name = null) {
    const kind = detect(text);
    if (!kind) throw new Error('That doesn\'t look like a shader (no mainImage(), main() or ISF header).');
    const r = kind === 'isf' ? fromISF(text, name) : fromShadertoy(text, name);
    return { ...r, kind };
  }
  // a ◇ layer → Shadertoy text (tabs with headers; slider uniforms as consts at their current values)
  function toShadertoy(code) {
    const L = parseLayer(code);
    if (!L) throw new Error('Not a shader layer.');
    const vals = lineValues(LINE_RE.exec(String(code))?.[0] || '');
    const lit = (k) => vals[k];
    const consts = (txt) => String(txt).replace(UNI_RE, (all, kind, n, hint) => {
      if (BUILTIN.has(n) || kind === 'sampler2D') return all;
      const v = lit(n); const x = lit(`${n}_x`); const y = lit(`${n}_y`);
      const col = (h) => { const c = hex6(String(h).replace(/['"]/g, '')) || '#ffffff'; const p = [1, 3, 5].map((i) => fmtNum(parseInt(c.slice(i, i + 2), 16) / 255)); return p; };
      let val;
      if (kind === 'vec2') val = `vec2(${x ?? 0.5}, ${y ?? 0.5})`;
      else if (kind === 'vec3') val = v ? `vec3(${col(v).join(', ')})` : 'vec3(1.0)';
      else if (kind === 'vec4') val = v ? `vec4(${col(v).join(', ')}, 1.0)` : 'vec4(1.0)';
      else if (kind === 'bool') val = v === 'true' ? 'true' : 'false';
      else if (kind === 'int') val = /^['"]/.test(v || '') ? String(Math.max(0, parseHint(kind, hint).options?.indexOf(v.slice(1, -1)) ?? 0)) : String(Math.round(Number(v ?? 0)));
      else { const n2 = /^['"]/.test(v || '') ? Math.max(0, parseHint(kind, hint).options?.indexOf(v.slice(1, -1)) ?? 0) : Number(v ?? 0); val = String(n2).includes('.') ? String(n2) : `${n2}.0`; }
      return `const ${kind} ${n} = ${val};${hint}`;
    });
    const out = [];
    if (L.common) out.push('// Common', consts(L.common));
    for (const [k, b] of Object.entries(L.buffers)) out.push(`// Buffer ${k}${Object.entries(L.channels[k] || {}).map(([c, v]) => ` · ${c}: ${v}`).join('')}`, consts(b.code));
    out.push(`// Image${Object.entries(L.channels.image || {}).map(([c, v]) => ` · ${c}: ${v}`).join('')}`, consts(L.image));
    return `${out.join('\n')}\n`;
  }
  const HELP = `◇ SHADER LAYERS (a fragment shader as a Lab layer; /shader opens the workbench)
Write Shadertoy-style GLSL: void mainImage(out vec4 fragColor, in vec2 fragCoord) (or main() with gl_FragColor).
Built in: iTime (the scene's clock: song / timeline / sequence) iTimeDelta iFrame iResolution iMouse iDate; iChannel0–3 + iChannelResolution;
music: uKick uSnare uHats uHit uBeat uBass uMid uTreble uLevel uDrop uEnergy uBeatPhase uBarPhase, uBands (bass, mid, treble, level);
uPrev (this pass's last frame), uBelow (the layers under it), uAudio (512×2: spectrum at y 0.25, waveform at y 0.75); vUv.
Sliders: uniform float uGlow; // [Look] 0..2, 1 Glow amount · uniform vec3 uTint; // #ff8c42 · uniform bool uMirror; // on
· uniform int uMode; // options: rings, bars · uniform vec2 uCenter; // 0..1 = 0.5 0.5 (XY pad in the workbench).
Channels (shader options, or /shader channel iChannel0 <source>): audio · self (feedback) · A–D (buffers) · below · layer:<name> · ref:<key> · noise · none.
Multi-pass: buffers: { A: { code: bufferA, iChannel0: 'A', scale: 0.5 } } drawn in order before the image; scale: 0.5 draws the whole layer at half resolution in the preview.
Import: /shader import (paste a Shadertoy Image tab, tabs with "// Buffer A" headers, the Shadertoy JSON, or an ISF .fs). /shader new <starter> · /shader list.
Errors show on their line in the code; the last version that compiled keeps drawing.`;
  return { MARK, LINE_RE, BUILTIN, SOURCES, SOURCE_HINT, HELP, isShader, labelOf, parseHint, parseUniforms, controlsOf, sliderLine, lineValues, glslBlocks, syncCode, parseLit, fmtLit, callOf, parseLayer, setOpts, setPass, layerCode, STARTERS, starter, starterCode, fromShadertoy, fromISF, detect, importText, toShadertoy, channelsFor, hex6 };
})();
if (typeof window !== 'undefined') window.ShaderLib = ShaderLib;
if (typeof module !== 'undefined') module.exports = ShaderLib;
