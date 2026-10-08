// Sliders for Three.js Lab sketches. Finds the numbers and colors in a sketch, runs it with each one
// read through __tv(i) so it can change live, learns which ones the scene re-reads every frame, and
// writes the values back into the code on Save. Sketches can also declare named controls:
//   const P = tweak({ speed: [1, 0, 5], glow: { value: 1.2, min: 0, max: 3, onChange: (v) => … }, tint: '#ff3cac', wire: false });
const ThreeTweaks = (() => {
  const EXPR_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
  const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'await']);
  // Argument names for the constructors and setters sketches use most.
  const ARGS = {
    PerspectiveCamera: ['fov', 'aspect', 'near', 'far'], OrthographicCamera: ['left', 'right', 'top', 'bottom', 'near', 'far'],
    BoxGeometry: ['width', 'height', 'depth', 'width segments', 'height segments', 'depth segments'],
    SphereGeometry: ['radius', 'width segments', 'height segments'], PlaneGeometry: ['width', 'height', 'width segments', 'height segments'],
    TorusGeometry: ['radius', 'tube', 'radial segments', 'tubular segments', 'arc'], TorusKnotGeometry: ['radius', 'tube', 'tubular segments', 'radial segments', 'p', 'q'],
    CylinderGeometry: ['radius top', 'radius bottom', 'height', 'radial segments', 'height segments'], ConeGeometry: ['radius', 'height', 'radial segments', 'height segments'],
    CapsuleGeometry: ['radius', 'length', 'cap segments', 'radial segments'], CircleGeometry: ['radius', 'segments'], RingGeometry: ['inner radius', 'outer radius', 'theta segments'],
    IcosahedronGeometry: ['radius', 'detail'], OctahedronGeometry: ['radius', 'detail'], DodecahedronGeometry: ['radius', 'detail'], TetrahedronGeometry: ['radius', 'detail'],
    AmbientLight: ['color', 'intensity'], DirectionalLight: ['color', 'intensity'], PointLight: ['color', 'intensity', 'distance', 'decay'],
    SpotLight: ['color', 'intensity', 'distance', 'angle', 'penumbra', 'decay'], HemisphereLight: ['sky color', 'ground color', 'intensity'], RectAreaLight: ['color', 'intensity', 'width', 'height'],
    Fog: ['color', 'near', 'far'], FogExp2: ['color', 'density'], Color: ['color'], GridHelper: ['size', 'divisions', 'center color', 'grid color'], AxesHelper: ['size'],
    UnrealBloomPass: ['resolution', 'strength', 'radius', 'threshold'], setPixelRatio: ['pixel ratio'], setClearColor: ['color', 'alpha'], lerp: ['target', 'amount'],
  };
  const VECTOR_OWNERS = /(^|\.)(position|rotation|scale|offset|repeat|center|up|target|velocity|direction)$/;
  const UNIT_RANGE = /(^|\W)(opacity|roughness|metalness|penumbra|threshold|clearcoat|clearcoatRoughness|transmission|sheen|iridescence|reflectivity|alpha|damping|dampingFactor)$/i;
  const SEGMENTS = /segments|detail|divisions/i;
  const HEX6 = /^0x[0-9a-f]{6}$/i;
  const CSS_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/;

  // ---------- scanning ----------
  function scan(code) {
    const items = [];
    const toks = [];
    const stack = [];
    const n = code.length;
    let pos = 0;
    let tweakCalls = 0;
    const tok = (back = 1) => toks[toks.length - back];
    const push = (t, v) => { toks.push({ t, v }); if (toks.length > 16) toks.shift(); };
    const top = () => stack[stack.length - 1];
    const nextChar = (p) => { while (p < n && /\s/.test(code[p])) p += 1; return code[p]; };
    const skipString = (p) => { const q = code[p]; p += 1; while (p < n && code[p] !== q && code[p] !== '\n') p += code[p] === '\\' ? 2 : 1; return p + 1; };
    const skipTemplate = (p) => {
      p += 1;
      while (p < n && code[p] !== '`') {
        if (code[p] === '\\') { p += 2; continue; }
        if (code[p] === '$' && code[p + 1] === '{') {
          let depth = 1;
          p += 2;
          while (p < n && depth) {
            if (code[p] === '`') p = skipTemplate(p);
            else if (code[p] === '"' || code[p] === "'") p = skipString(p);
            else { if (code[p] === '{') depth += 1; if (code[p] === '}') depth -= 1; p += 1; }
          }
          continue;
        }
        p += 1;
      }
      return p + 1;
    };
    const skipRegex = (p) => {
      let cls = false;
      p += 1;
      while (p < n && code[p] !== '\n') {
        const c = code[p];
        if (c === '\\') { p += 2; continue; }
        if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break;
        p += 1;
      }
      p += 1;
      while (p < n && /[a-z]/i.test(code[p])) p += 1;
      return p;
    };
    const regexAllowed = () => {
      const l = tok();
      if (!l || l.t === 'kw') return true;
      if (l.t === 'p') return !(l.v === ')' || l.v === ']' || l.v === '++' || l.v === '--');
      return false;
    };
    // Member chain ending at token index `end` (inclusive), e.g. knot.position.set → ['knot','position','set'].
    const chainBack = (end) => {
      const parts = [];
      let k = end;
      while (k >= 0 && toks[k]?.t === 'id') { parts.unshift(toks[k].v); if (toks[k - 1]?.v === '.' || toks[k - 1]?.v === '?.') k -= 2; else break; }
      return parts;
    };

    function literal(s, e, value, kind, raw) {
      const ctx = top();
      if (stack.some((c) => c.skip)) return;
      let start = s;
      let v = value;
      let prev = tok();
      let prevIdx = toks.length - 1;
      // A unary minus right before the number belongs to it (but not the binary minus in `a - 1`).
      if (kind === 'number' && prev?.v === '-' && code[s - 1] === '-') {
        const before = tok(2);
        if (!before || before.t === 'kw' || (before.t === 'p' && !/^[)\]]$/.test(before.v) && before.v !== '++' && before.v !== '--')) { start = s - 1; v = -value; prev = before; prevIdx -= 1; }
      }
      // Numeric object keys ({ 0: … }) aren't values.
      if (ctx?.type === '{' && (prev?.v === '{' || prev?.v === ',') && nextChar(e) === ':') return;
      const item = { start, end: e, kind, orig: v, raw: code.slice(start, e), int: kind === 'number' && /^-?\d[\d_]*$/.test(raw), hexNum: /^0x/i.test(raw), quote: (kind === 'color' || kind === 'choice') && /^['"]/.test(raw) ? raw[0] : null };
      if (ctx?.tweakObj && prev?.v === ':' && ctx.key) { item.call = ctx.tweakCall; item.key = ctx.key; }
      else if (ctx?.tweakArr) {
        if (ctx.argIdx === 0) { item.call = ctx.call; item.key = ctx.key; ctx.item = item; } else if (kind === 'number') { ctx.range[['', 'min', 'max', 'step'][ctx.argIdx]] = v; return; } else return;
      } else if (ctx?.tweakSpec && prev?.v === ':') {
        if (ctx.key === 'value') { item.call = ctx.call; item.key = ctx.specKey; ctx.item = item; } else if (/^(min|max|step)$/.test(ctx.key) && kind === 'number') { ctx.range[ctx.key] = v; return; } else if (kind !== 'number' && kind !== 'color') return;
      }
      if ((kind === 'bool' || kind === 'choice') && item.key == null) return; // true/false and text only as named controls
      item.name = item.key ?? nameFor(prev, prevIdx, ctx);
      items.push(item);
    }

    function nameFor(prev, prevIdx, ctx) {
      if (prev && /^([+\-*/%]|\*\*)?=$/.test(prev.v)) {
        const chain = chainBack(prevIdx - 1);
        if (chain.length) return chain.join('.');
      }
      if (ctx?.type === '{' && prev?.v === ':' && ctx.key) return ctx.owner ? `${ctx.owner} · ${ctx.key}` : ctx.key;
      if (ctx?.type === '(' && ctx.callee && (prev?.v === '(' || prev?.v === ',')) {
        const { callee, owner, argIdx } = ctx;
        if (callee === 'set' && owner && VECTOR_OWNERS.test(owner)) return `${owner}.${'xyzw'[argIdx] || argIdx}`;
        if (callee === 'set' && owner) return owner;
        const names = ARGS[callee];
        return `${names || !owner ? callee : `${owner}.${callee}`} · ${names?.[argIdx] || `arg ${argIdx + 1}`}`;
      }
      return null;
    }

    while (pos < n) {
      const c = code[pos];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { pos += 1; continue; }
      if (c === '/' && code[pos + 1] === '/') { const e = code.indexOf('\n', pos); pos = e < 0 ? n : e; continue; }
      if (c === '/' && code[pos + 1] === '*') { const e = code.indexOf('*/', pos + 2); pos = e < 0 ? n : e + 2; continue; }
      if (c === '"' || c === "'") {
        const e = skipString(pos);
        const raw = code.slice(pos, e);
        const inner = raw.slice(1, -1);
        const ctx = top();
        const afterColon = tok()?.v === ':';
        if (ctx?.type === '{' && (tok()?.v === '{' || tok()?.v === ',') && nextChar(e) === ':') {
          if (ctx) ctx.key = inner; // quoted key
        } else if (ctx?.optionsOf) ctx.optionsOf.meta.options.push(inner);
        else if (ctx?.tweakSpec && afterColon && /^(label|group|hint|unit)$/.test(ctx.key || '')) ctx.meta[ctx.key] = inner;
        else if (ctx?.tweakSpec && afterColon && ctx.key === 'value' && !CSS_HEX.test(inner)) literal(pos, e, inner, 'choice', raw);
        else if (CSS_HEX.test(inner)) literal(pos, e, normHex(inner), 'color', raw);
        push('str', raw);
        pos = e;
        continue;
      }
      if (c === '`') { pos = skipTemplate(pos); push('str', '`'); continue; }
      if (c === '/' && regexAllowed()) { pos = skipRegex(pos); push('str', '/re/'); continue; }
      if (/[A-Za-z_$]/.test(c)) {
        let e = pos + 1;
        while (e < n && /[\w$]/.test(code[e])) e += 1;
        const word = code.slice(pos, e);
        const ctx = top();
        const afterDot = tok()?.v === '.' || tok()?.v === '?.';
        if (!afterDot && ctx?.type === '{' && (tok()?.v === '{' || tok()?.v === ',') && nextChar(e) === ':') ctx.key = word;
        else if (!afterDot && (word === 'true' || word === 'false')) literal(pos, e, word === 'true', 'bool', word);
        push(!afterDot && EXPR_KEYWORDS.has(word) ? 'kw' : 'id', word);
        pos = e;
        continue;
      }
      if (/\d/.test(c) || (c === '.' && /\d/.test(code[pos + 1]))) {
        const raw = NUMBER.exec(code.slice(pos, pos + 64))?.[0] || c;
        const e = pos + raw.length;
        if (!raw.endsWith('n') && !/[\w$]/.test(code[e] || '')) {
          const v = Number(raw.replace(/_/g, ''));
          if (Number.isFinite(v)) literal(pos, e, HEX6.test(raw) ? numToHex(v) : v, HEX6.test(raw) ? 'color' : 'number', raw);
        }
        push('num', raw);
        pos = e;
        continue;
      }
      // Punctuation (the multi-character operators that matter here).
      const three = code.slice(pos, pos + 3);
      const two = code.slice(pos, pos + 2);
      const op = ['===', '!==', '**=', '...', '>>>'].includes(three) ? three
        : ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '&=', '|=', '^='].includes(two) ? two : c;
      const ctx = top();
      if (op === '(') {
        const prev = tok();
        const callee = prev?.t === 'id' && !NOT_CALLS.has(prev.v) ? prev.v : null;
        const chain = callee ? chainBack(toks.length - 1) : [];
        const frame = { type: '(', callee, owner: chain.slice(0, -1).join('.') || null, argIdx: 0, skip: prev?.v === 'for' };
        if (callee === 'tweak') { frame.tweakCall = tweakCalls; tweakCalls += 1; }
        stack.push(frame);
      } else if (op === '[') {
        const prev = tok();
        const index = prev && (prev.t === 'id' || prev.v === ')' || prev.v === ']') && !(prev.t === 'id' && EXPR_KEYWORDS.has(prev.v));
        const frame = { type: '[', argIdx: 0, skip: index };
        if (ctx?.tweakObj && prev?.v === ':' && ctx.key) Object.assign(frame, { tweakArr: true, call: ctx.tweakCall, key: ctx.key, range: {} });
        if (ctx?.tweakSpec && prev?.v === ':' && ctx.key === 'options') frame.optionsOf = ctx;
        stack.push(frame);
      } else if (op === '{') {
        const prev = tok();
        const frame = { type: '{', key: null, argIdx: 0, owner: ctx?.type === '(' && ctx.callee && (prev?.v === '(' || prev?.v === ',') ? ctx.callee : null };
        if (ctx?.tweakCall != null && prev?.v === '(') frame.tweakObj = true, frame.tweakCall = ctx.tweakCall;
        if (ctx?.tweakObj && prev?.v === ':' && ctx.key) Object.assign(frame, { tweakSpec: true, call: ctx.tweakCall, specKey: ctx.key, range: {}, meta: { options: [] } });
        stack.push(frame);
      } else if (op === ')' || op === ']' || op === '}') {
        const frame = stack.pop();
        if (frame?.item && frame.range) Object.assign(frame.item, frame.range);
        if (frame?.item && frame.meta) {
          const { options, ...rest } = frame.meta;
          Object.assign(frame.item, rest);
          if (options.length) frame.item.options = options;
        }
      } else if (op === ',' && ctx) { ctx.argIdx += 1; if (ctx.type === '{') ctx.key = null; }
      push('p', op);
      pos += op.length;
    }

    const lineStarts = [0];
    for (let i = 0; i < n; i += 1) if (code[i] === '\n') lineStarts.push(i + 1);
    for (const it of items) {
      let lo = 0; let hi = lineStarts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= it.start) lo = mid; else hi = mid - 1; }
      it.line = lo + 1;
      const ls = lineStarts[lo];
      const le = code.indexOf('\n', ls);
      const text = code.slice(ls, le < 0 ? n : le);
      it.lineText = text.trim();
      const a = it.start - ls; const b = it.end - ls;
      it.before = text.slice(Math.max(0, a - 26), a).replace(/^\s+/, '');
      it.after = text.slice(b, b + 18).replace(/\s+$/, '');
      if (a > 26) it.before = `…${it.before}`;
      it.range = rangeFor(it);
    }
    return { code, items };
  }

  const normHex = (h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toLowerCase();
  const numToHex = (v) => `#${(Math.max(0, Math.round(v)) & 0xffffff).toString(16).padStart(6, '0')}`;

  // Whole-number-only values (segment counts, array sizes); everything else slides smoothly.
  const COUNTS = /segments|detail|divisions|count|samples|octaves|iterations|Array · arg/i;
  const niceStep = (span) => 10 ** (Math.floor(Math.log10(span || 1)) - 2);
  function rangeFor(it) {
    if (it.kind !== 'number') return null;
    const v = it.orig;
    const name = it.name || '';
    it.int = it.int && COUNTS.test(name);
    let min; let max;
    if (it.min != null && it.max != null) { min = it.min; max = it.max; }
    else if (UNIT_RANGE.test(name) && v >= 0 && v <= 1) { min = 0; max = 1; }
    else if (it.int) { min = /detail/i.test(name) ? 0 : 1; max = Math.max(Math.abs(v) * 4, 8); }
    else if (v === 0) { min = -5; max = 5; }
    else { const a = Math.abs(v); min = v < 0 ? -a * 3 : 0; max = a * 3; }
    min = it.min ?? min; max = it.max ?? max;
    const step = it.step ?? (it.int ? 1 : niceStep(max - min));
    const round = (x) => Number(x.toPrecision(6));
    return { min: round(min), max: round(max), step };
  }

  // Code with every literal swapped for a live read; same line numbers, so errors still point at the right line.
  // base: where this layer's values start in the sandbox (each layer has its own range).
  function instrument(code, items, base = 0) {
    let out = '';
    let p = 0;
    items.forEach((it, i) => { out += code.slice(p, it.start) + (/[\w$]/.test(code[it.start - 1] || '') ? ' ' : '') + `__tv(${base + i})`; p = it.end; });
    return out + code.slice(p);
  }

  const trimNum = (v) => String(Number(Number(v).toFixed(4)));
  function format(it, v, code) {
    if (it.kind === 'bool') return String(Boolean(v));
    if (it.kind === 'color') return it.quote ? `${it.quote}${v}${it.quote}` : `0x${v.slice(1)}`;
    if (it.kind === 'choice') return `${it.quote}${String(v).replace(/[\\'"`]/g, '')}${it.quote}`;
    let text = it.int ? String(Math.round(v)) : trimNum(v);
    if (it.hexNum && it.int && v >= 0) text = `0x${Math.round(v).toString(16)}`;
    if (v < 0 && /[+\-]/.test(code[it.start - 1] || '')) text = `(${text})`; // a - -1, never a--1
    return text;
  }
  function applyValues(code, items, values) {
    let out = code;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (same(it, values[i])) continue;
      out = out.slice(0, it.start) + format(it, values[i], code) + out.slice(it.end);
    }
    return out;
  }
  const same = (it, v) => (it.kind === 'number' ? Math.abs(v - it.orig) < 1e-9 : v === it.orig);

  // ---------- panel + state ----------
  // Module-level save helper (the controller has its own applyValues for slider values).
  const applyValues_ = (code, items, vals) => applyValues(code, items, vals);
  const BANDS = [['kick', 'Kick'], ['snare', 'Snare'], ['hats', 'Hats'], ['bassHit', 'Bass hit'], ['hit', 'Hit'], ['beat', 'Beat'], ['bass', 'Bass'], ['mid', 'Mids'], ['treble', 'Highs'], ['level', 'Loudness']];
  const BAND_NAME = Object.fromEntries(BANDS);
  // Ways a control can move by itself (on top of your value): [kind, name, hint]
  const MOTIONS = [['', 'Still', 'Stays where you put it'], ['lfo', 'Wave (LFO)', 'Smooth up and down in time with the beat'], ['walk', 'Random walk', 'Drifts around on its own'],
    ['beat', 'Steps on beats', 'A new random value every beat (or every few)'], ['pulse', 'Pulse on beats', 'Jumps up on each beat and falls back'], ['section', 'Song sections', 'Lower in quiet parts, higher in loud ones']];
  const MOTION_NAME = Object.fromEntries(MOTIONS);
  const RATES = [[0.25, '¼ beat'], [0.5, '½ beat'], [1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars']];
  const motionDefaults = (kind) => ({ kind, shape: 'sine', rate: kind === 'lfo' ? 4 : kind === 'walk' ? 2 : 1, depth: kind === 'pulse' ? 0.3 : 0.2 });
  // Seeded randomness so a shuffle can be repeated from its number.
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hashSeed = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const flash = (node) => { if (!node) return; node.classList.remove('tw-flash'); void node.offsetWidth; node.classList.add('tw-flash'); };
  // A small menu with headings and hints, used across the Lab: items are 'Heading' | [label, hint, fn, on?, feature?] | null.
  function menu(x, y, items) {
    document.querySelector('.mb-menu.lab-pop')?.remove();
    const m = el('div', { class: 'mb-menu lab-pop' }, items.filter(Boolean).map((it) => (typeof it === 'string'
      ? el('div', { class: 'menu-head', text: it })
      : el('button', { class: `menu-item${it[3] ? ' on' : ''}`, dataset: it[4] ? { feature: it[4] } : {}, on: { click: () => { m.remove(); it[2](); } } }, el('b', { text: it[0] }), el('span', { class: 'hint', text: it[1] || '' })))));
    Object.assign(m.style, { left: `${Math.max(8, Math.min(innerWidth - 312, x))}px`, top: `${Math.max(8, y)}px`, transform: 'none', maxHeight: '70vh', overflowY: 'auto' });
    document.body.append(m);
    requestAnimationFrame(() => { const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 8) m.style.top = `${Math.max(8, innerHeight - 8 - r.height)}px`; });
    const close = (e) => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', close, true); removeEventListener('keydown', esc, true); } };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); m.remove(); removeEventListener('pointerdown', close, true); removeEventListener('keydown', esc, true); } };
    setTimeout(() => { addEventListener('pointerdown', close, true); addEventListener('keydown', esc, true); });
    return m;
  }
  // camelCase / snake_case keys → "Orb size"
  const humanize = (k) => {
    const words = String(k).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim().split(/\s+/);
    return words.map((w, i) => (/^[A-Z0-9]{2,}$/.test(w) ? w : i ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  };
  const labelOf = (it) => it.label || (it.key != null ? humanize(it.key) : it.name);
  // Stable ids for looks and music links: named controls by key, other values by name + occurrence.
  function idsFor(items) {
    const seen = {};
    return items.map((it) => {
      if (it.key != null) return `k:${it.key}`;
      const base = it.name || `${it.before.trim()}|${it.raw}`;
      seen[base] = (seen[base] || 0) + 1;
      return `${base}#${seen[base]}`;
    });
  }

  // send(msg) → sandbox, rerun({ hot }) → run the sketch again (hot = in place, no reload), goToLine(n),
  // commit(newCode) → write into the editor, persist(kind, data) → per-sketch looks/music links,
  // askForSliders() / quickAsk(text) → the Three Director.
  // keyframes (optional): { state(key) → 'none'|'animated'|'on', toggle(key, value), changed(key, value, { final }) → true when the
  // value went into a keyframe (the control is animated) }. Only named controls (tweak()) can be animated.
  // learn(key, label) → map a MIDI knob to it (optional); clock() → { t, bpm, playing, section } for motions (optional).
  // palette() → the sketch's colors (for "colors from the palette").
  function controller({ send, rerun, goToLine, commit, askForSliders, quickAsk, persist, keyframes, touched, learn, clock, palette }) {
    let scanned = null;
    let ids = [];
    let values = [];
    let broken = null;
    let instrumented = false;
    let reads = null; // { used:Set, live:Set } once the sandbox reports
    let showUnused = false;
    let filter = '';
    let looks = [];
    let bindings = {};
    let locks = new Set(); // ids of controls held at their value (sliders, shuffle, looks, MIDI and resets leave them alone)
    let favs = new Set(); // ids shown in ★ Favorites at the top
    let layout = store.get('three.twLayout', 'auto'); // auto | knobs | sliders
    let groupFilter = '';
    let changedOnly = false;
    const collapsed = new Set(store.get('three.twCollapsed', []));
    let undoStack = [];
    let committed = [];
    const rows = [];
    const body = el('div', { class: 'tw-body' });
    const count = el('span', { class: 'tw-count' });
    const status = el('div', { class: 'tw-status' });
    const notice = el('div', { class: 'tw-notice', hidden: true });
    const looksBar = el('div', { class: 'tw-looks' });
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    // The two most-used buttons of the whole Lab (Save 46, Shuffle 31) are the biggest ones here, each with a ▾ for
    // its variants; everything rarer sits in the ⋯ menu.
    const saveBtn = btn('Save', 'Keep these values: write them into the sketch code (the old code stays in History) · Ctrl+S · Shift+click: save them as a look instead', (e) => (e.shiftKey ? quickLook() : save()), 'primary small tw-big tw-save');
    saveBtn.dataset.feature = 'Save';
    saveBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); saveMenu(saveBtn); });
    saveBtn.dataset.key = 'Ctrl+S';
    const saveMore = btn('▾', 'Save as a look, into a slot (A / B / C), auto-save…', (e) => saveMenu(e.currentTarget), 'primary small tw-big tw-split');
    saveMore.dataset.feature = 'Save options';
    const resetBtn = btn('Reset', 'Back to the values in the code', () => reset());
    const undoBtn = btn('↶', 'Undo the last slider change', () => undo());
    const shuffleBtn = btn('🎲 Shuffle', 'Shuffle: nudge the controls to random nearby values (R) · ‹ › step back / forward through your shuffles · ▾ amount, which ones, seeds', () => shuffle(), 'ghost small tw-big tw-shuffle');
    shuffleBtn.dataset.feature = 'Shuffle';
    shuffleBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); shuffleMenu(shuffleBtn); });
    shuffleBtn.dataset.key = 'R';
    const shufBack = btn('‹', 'The previous shuffle (Shift+R)', () => shuffleStep(-1), 'ghost small tw-big tw-step');
    shufBack.dataset.feature = 'Shuffle back';
    const shufFwd = btn('›', 'The next shuffle (or a new one)', () => shuffleStep(1), 'ghost small tw-big tw-step');
    shufFwd.dataset.feature = 'Shuffle forward';
    const shufMore = btn('▾', 'Shuffle options: amount, which controls, seeds', (e) => shuffleMenu(e.currentTarget), 'ghost small tw-big tw-split');
    shufMore.dataset.feature = 'Shuffle options';
    const moreBtn = btn('⋯', 'More: reset, undo, copy / paste values, knobs or sliders, auto-save, filters', (e) => moreMenu(e.currentTarget), 'ghost small tw-more');
    moreBtn.dataset.feature = 'Sliders more';
    const unusedBox = el('input', { type: 'checkbox' });
    unusedBox.addEventListener('change', () => { showUnused = unusedBox.checked; applyFilter(); });
    const search = el('input', { type: 'search', class: 'tw-search', placeholder: 'Find a slider…  ( / )' });
    search.addEventListener('input', () => { filter = search.value.toLowerCase().trim(); applyFilter(); });
    // Enter jumps to the first match, Esc clears the search
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; filter = ''; applyFilter(); }
      if (e.key === 'Enter') { const r = rows.find((x) => !x.el.hidden && x.el.offsetParent); if (r) { r.el.scrollIntoView({ block: 'center' }); flash(r.el); (r.el.querySelector('input, svg, button.tw-toggle, .tw-seg-btn') || r.el).focus?.(); } }
    });
    const matchCount = el('span', { class: 'tw-matches' });
    // Show one group at a time, knobs or sliders, only what you changed, and hold A/B to hear… see the code's values.
    const groupSel = el('select', { class: 'tw-groupsel', title: 'Show one group' });
    groupSel.addEventListener('change', () => { groupFilter = groupSel.value; applyFilter(); });
    const layoutSel = el('select', { class: 'tw-layoutsel', title: 'Knobs or sliders for numbers' },
      [['auto', 'Auto'], ['knobs', 'Knobs'], ['sliders', 'Sliders']].map(([v, l]) => el('option', { value: v, text: l, selected: v === layout })));
    layoutSel.addEventListener('change', () => { layout = layoutSel.value; store.set('three.twLayout', layout); render(); });
    // Auto-save: a moment after you let go of a control, its value is written into the code.
    const autoSaveBox = el('input', { type: 'checkbox', checked: store.get('three.twAutosave', false) });
    autoSaveBox.addEventListener('change', () => { store.set('three.twAutosave', autoSaveBox.checked); if (autoSaveBox.checked && dirtyCount()) autoSave(); });
    let autoSaveTimer = 0;
    const autoSave = () => { clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { if (store.get('three.twAutosave', false) && dirtyCount() && !root.matches(':active') && !comparing) save(); }, 1500); };
    // One group open at a time: opening a group folds the others.
    const accordionBox = el('input', { type: 'checkbox', checked: store.get('three.twAccordion', false) });
    accordionBox.addEventListener('change', () => store.set('three.twAccordion', accordionBox.checked));
    const changedBox = el('input', { type: 'checkbox' });
    changedBox.addEventListener('change', () => { changedOnly = changedBox.checked; applyFilter(); });
    const abBtn = btn('A/B', 'Hold to see the values in the code (A); let go for yours (B)', () => {});
    abBtn.addEventListener('pointerdown', () => compare(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) abBtn.addEventListener(ev, () => compare(false));
    // Folds to one line so the controls get the room; remembers whether you keep it open.
    const asks = quickAsk ? el('details', { class: 'tw-asks', on: { toggle: (e) => store.set('three.twAsksOpen', e.currentTarget.open) } },
      el('summary', { class: 'tw-asks-title', text: 'Ask the director' }),
      ...['3 variations to pick from', 'More energy', 'Calmer', 'New colors', 'Hit harder on beats', 'React to the kick', 'Change on the drop', 'Fill the 9:16 frame', 'Simpler', 'More detail', 'Add a slider for…'].map((t) => el('button', {
        class: 'tw-chip', text: t, title: t.endsWith('…') ? 'Starts the message so you can finish it' : `Send "${t}" to the Three Director`,
        on: { click: () => quickAsk(t) },
      }))) : null;
    if (asks) asks.open = store.get('three.twAsksOpen', false);
    // Save slots A / B / C (click: recall · empty or Shift+click: store · hold: peek · Alt+click: clear) and a
    // crossfader that morphs between two of them.
    const SLOTS = ['A', 'B', 'C'];
    let slots = {};
    let morphPair = store.get('three.twMorphPair', ['A', 'B']);
    const slotBtns = SLOTS.map((n) => {
      const b = btn(n, '', () => {}, 'ghost small tw-slotbtn');
      b.dataset.feature = `Slot ${n}`;
      let peekT = 0; let peeked = false;
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        peeked = false;
        if (slots[n] && !e.shiftKey && !e.altKey) peekT = setTimeout(() => { peeked = true; peek(slotValues(n)); b.classList.add('peek'); }, 280);
      });
      const endPeek = () => { clearTimeout(peekT); if (peeked) { peek(null); b.classList.remove('peek'); } };
      b.addEventListener('pointerup', endPeek);
      b.addEventListener('pointerleave', endPeek);
      b.addEventListener('click', (e) => {
        if (peeked) { peeked = false; return; }
        if (e.altKey) slotClear(n); else if (e.shiftKey || !slots[n]) slotSave(n); else slotRecall(n);
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); slotMenu(e, n); });
      return b;
    });
    const morph = el('input', { type: 'range', class: 'tw-morph', min: 0, max: 1, step: 0.001, value: 0, title: 'Morph between the two slots (drag) · double-click: halfway' });
    const morphLab = el('button', { class: 'tw-morph-lab', text: 'A↔B', title: 'Which two slots the crossfader morphs between' });
    morphLab.addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left, r.bottom + 4, ['Morph between', ...[['A', 'B'], ['B', 'C'], ['A', 'C']].map((p) => [`${p[0]} ↔ ${p[1]}`, p.every((x) => slots[x]) ? '' : 'save both first', () => { morphPair = p; store.set('three.twMorphPair', p); paintSlots(); }, p.join() === morphPair.join()])]); });
    morph.addEventListener('input', () => morphTo(Number(morph.value)));
    morph.addEventListener('change', () => morphTo(Number(morph.value), { release: true }));
    morph.addEventListener('dblclick', () => { morph.value = 0.5; morphTo(0.5, { release: true }); });
    const slotsRow = el('div', { class: 'tw-slots' }, el('span', { class: 'tw-slots-k', text: 'Slots' }), ...slotBtns, morphLab, morph);
    // Group chips: one click shows a single group (your slider groups get a lot of clicks), again shows all.
    const chips = el('div', { class: 'tw-gchips' });
    const root = el('div', { class: 'tweaks' },
      el('div', { class: 'tw-head' }, el('b', { text: 'Sliders' }), count, el('span', { class: 'spacer' }), moreBtn,
        el('div', { class: 'tw-actions' }, el('span', { class: 'tw-act' }, shufBack, shuffleBtn, shufFwd, shufMore), el('span', { class: 'tw-act' }, saveBtn, saveMore))),
      status, slotsRow, looksBar,
      el('div', { class: 'tw-tools' }, search, matchCount, abBtn),
      chips,
      notice, body, asks,
      el('div', { class: 'tw-foot', title: 'Knobs: drag up / down (Shift = fine, Alt = finer), wheel or arrow keys to step. Drag a slider\'s name sideways to scrub it. They click into the value in the code (the blue notch) as you pass it; double-click goes back to it. Right-click: lock, favorites, follow the music, move by itself, history, copy / paste, keyframe, MIDI.' },
        el('span', { html: '<b class="tw-live">⚡</b> instant · <b class="tw-rerun">↻</b> rebuilds · <b class="tw-music">♪</b> music / motion · <b style="color:#48ddff">|</b> code value · drag a name to scrub · right-click: more' })));

    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.type === 'range')) { e.preventDefault(); e.stopPropagation(); undo(); }
    });
    // Values used only while the scene is built re-run it in place, at most every 180 ms while dragging.
    let rebuildTimer = null;
    let rebuildAgain = false;
    function rebuild() {
      if (rebuildTimer) { rebuildAgain = true; return; }
      rerun({ hot: true });
      rebuildTimer = setTimeout(() => { rebuildTimer = null; if (rebuildAgain) { rebuildAgain = false; rebuild(); } }, 180);
    }
    const needsRebuild = (i) => !reads || (!reads.live.has(i) && reads.used.has(i));

    const dirtyCount = () => (scanned ? scanned.items.filter((it, i) => !same(it, values[i])).length : 0);
    const runtime = (it, v) => (it.kind === 'color' && !it.quote ? parseInt(v.slice(1), 16) : v);
    function refreshState() {
      const d = dirtyCount();
      saveBtn.disabled = !d; resetBtn.disabled = !d;
      abBtn.hidden = !d; // A/B only means something once a value differs from the code
      undoBtn.disabled = !undoStack.length;
      shuffleBtn.disabled = shufMore.disabled = !scanned?.items.some((it) => it.key != null);
      shufBack.disabled = shufPos <= 0;
      shufFwd.disabled = shuffleBtn.disabled;
      saveMore.disabled = !scanned?.items.length;
      saveBtn.textContent = d ? `Save ${d}` : 'Save';
      root.classList.toggle('dirty', d > 0);
      status.className = `tw-status${d ? ' dirty' : ''}`;
      status.textContent = !scanned?.items.length ? '' : d
        ? `${d} change${d > 1 ? 's' : ''} live · Save keeps ${d > 1 ? 'them' : 'it'} · ↶ in ⋯`
        : 'Changes show live as you move a slider. Nothing to save.';
      rows.forEach((r) => r.el.classList.toggle('changed', !same(r.it, values[r.i])));
      body.querySelectorAll('.tw-sec').forEach((sec) => sec.paintChanged?.());
      const cc = chips.querySelector('.tw-gchip-changed'); if (cc) cc.textContent = `• Changed${d ? ` ${d}` : ''}`;
      if (changedOnly) applyFilter();
    }
    function setValue(i, v, { release = false, external = false } = {}) {
      const it = scanned.items[i];
      if (locks.has(ids[i])) return;
      if (!external && it.key != null) touched?.(it.key, labelOf(it));
      // An animated control (or any control while Write is recording): the move becomes a keyframe at the playhead.
      const ks = it.key != null ? keyframes?.state(it.key) : null;
      if (ks && (ks !== 'none' || keyframes.writing?.()) && (it.kind === 'number' || it.kind === 'color')) {
        send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
        keyframes.changed(it.key, v, { final: release });
        rows.find((r) => r.i === i)?.paintKey?.();
        return;
      }
      values[i] = v;
      send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
      refreshState();
      if (needsRebuild(i)) rebuild();
      if (release) { checkpoint(); remember(i); }
    }
    // Each control's recent values (right-click → History), newest first.
    const valHist = {};
    function remember(i) {
      const id = ids[i]; const v = values[i];
      const list = (valHist[id] ||= []);
      if (list[0] === v) return;
      valHist[id] = [v, ...list.filter((x) => x !== v)].slice(0, 12);
    }
    const rememberIdx = (i) => remember(i);
    // Undo works on whole gestures: a checkpoint after each release, shuffle, look or reset.
    function checkpoint() {
      if (!scanned || committed.length !== values.length || committed.every((v, i) => v === values[i])) { committed = values.slice(); return; }
      undoStack.push(committed);
      if (undoStack.length > 60) undoStack.shift();
      committed = values.slice();
      refreshState();
      autoSave();
    }
    function applyValues(next, { remember = true } = {}) {
      let rb = false;
      next.forEach((v, i) => {
        if (v === values[i] || v === undefined || locks.has(ids[i])) return;
        values[i] = v;
        const it = scanned.items[i];
        send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
        rows.filter((r) => r.i === i).forEach((r) => r.set(v));
        if (needsRebuild(i)) rb = true;
      });
      if (rb) rebuild();
      if (remember) { checkpoint(); values.forEach((_, i) => { if (valHist[ids[i]]?.[0] !== values[i] && !same(scanned.items[i], values[i])) rememberIdx(i); }); } else committed = values.slice();
      refreshState();
    }
    function undo() {
      const prev = undoStack.pop();
      if (!prev || prev.length !== values.length) return;
      applyValues(prev, { remember: false });
    }
    // ---------- shuffle: amount, which controls, seeds, and a history you can step through ----------
    // shufOpt = { amount: 0.1 … 1 of each range, scope: 'all' | 'favs' | 'colors' | 'numbers' | 'visible' | 'changed' | 'group:<name>' }
    const AMOUNTS = [[0.1, 'Subtle'], [0.35, 'Normal'], [0.6, 'Bold'], [1, 'Wild']];
    let shufOpt = { amount: 0.35, scope: 'all', ...store.get('three.shuffle', {}) };
    let shufHist = []; // [{ values, seed, label }]: entry 0 is what you had before the first shuffle
    let shufPos = -1;
    const scopeName = (s) => (s === 'one' ? 'one at random' : s === 'all' ? 'every control' : s === 'favs' ? '★ favorites' : s === 'colors' ? 'colors' : s === 'numbers' ? 'numbers' : s === 'visible' ? 'what the panel shows' : s === 'changed' ? 'what you changed' : `"${s.slice(6)}"`);
    function scopeIdx(scope) {
      if (!scanned) return [];
      const all = scanned.items.map((_, i) => i).filter((i) => scanned.items[i].key != null && !locks.has(ids[i]));
      if (scope === 'favs') return all.filter((i) => favs.has(ids[i]));
      if (scope === 'colors') return all.filter((i) => scanned.items[i].kind === 'color');
      if (scope === 'numbers') return all.filter((i) => scanned.items[i].kind === 'number');
      if (scope === 'changed') return all.filter((i) => !same(scanned.items[i], values[i]));
      if (scope === 'visible') return all.filter((i) => rows.some((r) => r.i === i && !r.el.hidden && !r.el.closest('[hidden]')));
      if (scope?.startsWith('group:')) return all.filter((i) => (scanned.items[i].group || 'Controls') === scope.slice(6));
      if (scope === 'one') { const pool = all.filter((i) => scanned.items[i].kind !== 'bool'); return pool.length ? [pool[Math.floor(Math.random() * pool.length)]] : []; }
      return all;
    }
    // Colors from the sketch palette: every color control gets one of its colors (a different order each time)
    function paletteColors() {
      const pal = (palette?.() || []).filter((c) => CSS_HEX.test(c));
      if (pal.length < 2) { toast('Set a palette first (🎨 in the Lab toolbar, or a Coolors link)', { type: 'error' }); return false; }
      const idx = scopeIdx('colors');
      if (!idx.length) { toast('No color sliders here', { timeout: 1500 }); return false; }
      const order = [...pal].sort(() => Math.random() - 0.5);
      const next = values.slice(); idx.forEach((i, k) => { next[i] = normHex(order[k % order.length]); });
      applyValues(next);
      return true;
    }
    // Halfway back to the code (k = 0.5) or further out (k = 1.5): scales how far every changed number is from the code
    function tame(k) {
      if (!scanned) return 0;
      let n = 0;
      const next = values.map((v, i) => {
        const it = scanned.items[i];
        if (it.kind !== 'number' || same(it, v) || locks.has(ids[i])) return v;
        n += 1;
        let x = it.orig + (v - it.orig) * k;
        x = Math.max(Math.min(it.range.min, it.orig), Math.min(Math.max(it.range.max, it.orig), x));
        return it.int ? Math.round(x) : Number(x.toPrecision(6));
      });
      applyValues(next);
      return n;
    }
    // Save just one control into the code; your other changes stay live and unsaved
    function saveOne(i) {
      if (!scanned || same(scanned.items[i], values[i])) return false;
      const keep = Object.fromEntries(ids.map((id, k) => [id, values[k]]));
      const only = scanned.items.map((it, k) => (k === i ? values[k] : it.orig));
      const next = applyValues_(scanned.code, scanned.items, only);
      const fresh = scan(next);
      scanned = fresh; ids = idsFor(fresh.items);
      values = fresh.items.map((it, k) => (ids[k] in keep && typeof keep[ids[k]] === typeof it.orig ? keep[ids[k]] : it.orig));
      committed = values.slice(); undoStack = [];
      commit(next);
      render();
      toast('Saved that one into the code', { timeout: 1200 });
      return true;
    }
    // tweak({ … }) code with the current values, to paste into a sketch (or give the director)
    function tweakCode() {
      const byCall = {};
      scanned?.items.forEach((it, i) => { if (it.key == null) return; const v = values[i]; const val = it.kind === 'number' ? `{ value: ${trimNum(v)}, min: ${trimNum(it.range.min)}, max: ${trimNum(it.range.max)}${it.int ? ', step: 1' : ''}${it.group ? `, group: '${it.group}'` : ''} }` : JSON.stringify(v); (byCall[it.call] ||= []).push(`  ${it.key}: ${val},`); });
      return Object.values(byCall).map((lines) => `const P = tweak({\n${lines.join('\n')}\n});`).join('\n\n');
    }
    // { amount, scope, seed, only } → applies a shuffle and remembers it (‹ › step through them)
    function shuffle(o = {}) {
      if (!scanned) return null;
      const amount = Number(o.amount ?? shufOpt.amount) || 0.35;
      const scope = o.scope ?? shufOpt.scope;
      const only = o.only || scopeIdx(scope);
      if (!only.length) { toast(`Nothing to shuffle in ${scopeName(scope)}${locks.size ? ' (locked controls stay)' : ''}`, { timeout: 1800 }); return null; }
      const seed = Number.isFinite(Number(o.seed)) && o.seed !== '' && o.seed != null ? (Number(o.seed) >>> 0) : (Math.random() * 1e9) >>> 0;
      if (shufPos < 0 || JSON.stringify(shufHist[shufPos]?.values) !== JSON.stringify(values)) { shufHist = shufHist.slice(0, shufPos + 1); shufHist.push({ values: values.slice(), seed: null, label: 'before' }); shufPos = shufHist.length - 1; }
      const next = shuffled(only, amount, rng(seed));
      shufHist = shufHist.slice(0, shufPos + 1);
      shufHist.push({ values: next, seed, label: `${AMOUNTS.find((a) => a[0] === amount)?.[1] || `${Math.round(amount * 100)}%`} · ${scopeName(scope)}` });
      if (shufHist.length > 40) shufHist.shift();
      shufPos = shufHist.length - 1;
      applyValues(next);
      shuffleBtn.title = `Shuffle (R) · last: seed ${seed}, ${shufHist[shufPos].label} · ‹ › step through ${shufHist.length - 1} shuffle${shufHist.length === 2 ? '' : 's'}`;
      flash(shuffleBtn);
      return seed;
    }
    function shuffleStep(d) {
      if (d > 0 && shufPos >= shufHist.length - 1) { shuffle(); return; }
      const to = shufPos + d;
      if (to < 0 || to >= shufHist.length) { toast(d < 0 ? 'No earlier shuffle' : 'No later shuffle', { timeout: 1000 }); return; }
      shufPos = to;
      applyValues(shufHist[to].values);
      toast(shufHist[to].seed == null ? 'Back to before the shuffles' : `Shuffle ${to} of ${shufHist.length - 1} · seed ${shufHist[to].seed}`, { timeout: 1100 });
      refreshState();
    }
    // Random nearby values for the indexes in `only` (all named controls when null); amount = how far, of each range.
    function shuffled(only, amount = 0.35, rand = Math.random) {
      const next = values.slice();
      const rnd = (a, b) => a + rand() * (b - a);
      scanned.items.forEach((it, i) => {
        if (it.key == null || locks.has(ids[i])) return;
        if (only && !only.includes(i)) return;
        if (it.kind === 'number') {
          const { min, max, step } = it.range;
          const span = max - min;
          let x = amount >= 1 ? rnd(min, max) : Math.min(max, Math.max(min, values[i] + rnd(-amount, amount) * span));
          x = it.int ? Math.round(x) : Number((Math.round(x / step) * step).toFixed(6));
          next[i] = x;
        } else if (it.kind === 'color') next[i] = shiftHue(values[i], rnd(-0.5, 0.5) * Math.min(1, amount * 1.45));
        else if (it.kind === 'bool') next[i] = rand() < 0.25 * Math.min(2, amount / 0.35) ? !values[i] : values[i];
        else if (it.kind === 'choice' && it.options?.length) next[i] = rand() < 0.4 * Math.min(2.2, amount / 0.35) ? it.options[Math.floor(rand() * it.options.length)] : values[i];
      });
      return next;
    }
    function shuffleMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const groups = [...new Set((scanned?.items || []).filter((it) => it.key != null).map((it) => it.group || 'Controls'))];
      const set = (patch) => { shufOpt = { ...shufOpt, ...patch }; store.set('three.shuffle', shufOpt); };
      menu(r.left, r.bottom + 4, [
        'How far',
        ...AMOUNTS.map(([a, name]) => [name, `${Math.round(a * 100)}% of each range${a === 1 ? ' (anywhere)' : ''}`, () => { set({ amount: a }); shuffle(); }, shufOpt.amount === a]),
        'Which controls (locked ones always stay)',
        ...[['all', 'Everything'], ['favs', '★ Favorites only'], ['colors', 'Colors only'], ['numbers', 'Numbers only'], ['changed', 'Only what I changed'], ['visible', 'What the panel shows (search / group)']].map(([s, name]) => [name, '', () => { set({ scope: s }); shuffle(); }, shufOpt.scope === s]),
        ...(groups.length > 1 ? groups.map((g) => [`Group: ${g}`, '', () => { set({ scope: `group:${g}` }); shuffle(); }, shufOpt.scope === `group:${g}`]) : []),
        'One-offs',
        ['One control at random', 'Just one slider moves', () => shuffle({ scope: 'one' })],
        ['Colors from the palette', 'Each color slider gets a palette color', () => paletteColors()],
        ['Halfway back to the code', 'Tames a wild shuffle', () => tame(0.5)],
        ['Exaggerate the changes ×1.5', 'Pushes what you changed further', () => tame(1.5)],
        'Seeds',
        shufHist[shufPos]?.seed != null ? ['Copy this shuffle\'s seed', String(shufHist[shufPos].seed), () => navigator.clipboard.writeText(String(shufHist[shufPos].seed))] : null,
        ['Shuffle with a seed…', 'The same seed gives the same shuffle again', async () => { const v = await Modal.prompt('Seed', { value: String(shufHist[shufPos]?.seed ?? ''), placeholder: 'a number' }); if (v != null && v.trim()) shuffle({ seed: Number(v.trim()) || hashSeed(v) }); }],
        ...shufHist.map((h, i) => (h.seed == null ? null : [`${i === shufPos ? '● ' : ''}#${i} seed ${h.seed}`, h.label, () => { shufPos = i; applyValues(h.values); refreshState(); }, i === shufPos])).filter(Boolean).slice(-8),
        shufHist.length > 1 ? ['Forget the shuffle history', '', () => { shufHist = []; shufPos = -1; refreshState(); }] : null,
      ]);
    }
    function reset() {
      if (!scanned) return;
      applyValues(scanned.items.map((it) => it.orig));
    }

    // ---------- slots A / B / C, morph, peek ----------
    const byIds = (arr) => Object.fromEntries(ids.map((id, i) => [id, arr[i]]));
    function slotValues(n) { const s = slots[n]; return s ? ids.map((id, i) => (id in s && typeof s[id] === typeof values[i] ? s[id] : values[i])) : values.slice(); }
    function slotSave(n) {
      if (!scanned) return;
      slots = { ...slots, [n]: byIds(values) };
      persist?.('slots', slots);
      paintSlots();
      flash(slotBtns[SLOTS.indexOf(n)]);
      toast(`Slot ${n} saved · click it to come back · hold to peek`, { timeout: 1400 });
    }
    function slotRecall(n) { if (!slots[n]) return false; applyValues(slotValues(n)); flash(slotBtns[SLOTS.indexOf(n)]); return true; }
    function slotClear(n) { const s = { ...slots }; delete s[n]; slots = s; persist?.('slots', slots); paintSlots(); }
    function slotMenu(e, n) {
      menu(e.clientX, e.clientY, [`Slot ${n}`,
        ['Store the current values', slots[n] ? 'Replaces what it holds' : '', () => slotSave(n)],
        slots[n] ? ['Recall', 'Back to these values (↶ undoes)', () => slotRecall(n)] : null,
        slots[n] ? ['Save it as a look…', 'A named look in the looks bar', async () => { const v = await Modal.prompt('Look name', { value: `Slot ${n}` }); if (v?.trim()) { const keep = values.slice(); values = slotValues(n); saveLookAs(v); values = keep; } }] : null,
        slots[n] ? ['Clear', 'Alt+click does the same', () => slotClear(n)] : null,
        slots.A && slots.B ? ['Swap A and B', '', () => swapSlots()] : null,
        'Auto-morph (while it plays)',
        ...[1, 2, 4, 8].map((b) => [`${morphPair[0]} ↔ ${morphPair[1]} every ${b} bar${b === 1 ? '' : 's'}`, 'Glides back and forth on the beat; nothing to save', () => setAutoMorph(b), autoMorph === b]),
        autoMorph ? ['Stop auto-morph', '', () => setAutoMorph(0)] : null]);
    }
    function swapSlots() { if (!slots.A || !slots.B) return false; slots = { ...slots, A: slots.B, B: slots.A }; persist?.('slots', slots); paintSlots(); toast('Swapped A and B', { timeout: 1000 }); return true; }
    // Auto-morph: the crossfader glides A → B → A every N bars while the song plays, on top of your values
    // (like a look played at a cue: not saved, not marked changed). Off when the song stops.
    let autoMorph = 0;
    const morphSent = {};
    function setAutoMorph(bars) {
      autoMorph = Number(bars) || 0;
      if (autoMorph && !morphPair.every((x) => slots[x])) { autoMorph = 0; toast('Save both slots first', { type: 'error' }); }
      morph.classList.toggle('auto', Boolean(autoMorph));
      if (!autoMorph) { Object.keys(morphSent).forEach((i) => resend(Number(i))); for (const k of Object.keys(morphSent)) delete morphSent[k]; }
      syncMotion();
      return autoMorph;
    }
    function morphTick(c) {
      if (!autoMorph || !c.playing) return null;
      const beats = c.t / (60 / (c.bpm || 120));
      const ph = ((beats / (autoMorph * 4)) % 1 + 1) % 1;
      const k = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
      const arr = lerpVals(slotValues(morphPair[0]), slotValues(morphPair[1]), k);
      morph.value = k;
      return arr;
    }
    function paintSlots() {
      slotBtns.forEach((b, k) => {
        const n = SLOTS[k]; const has = Boolean(slots[n]);
        b.classList.toggle('full', has);
        b.title = has ? `Slot ${n}: click to recall · hold to peek · Shift+click to store again · Alt+click to clear` : `Slot ${n} is empty: click to store the current values`;
      });
      const ok = morphPair.every((x) => slots[x]);
      morph.disabled = !ok; morphLab.textContent = `${morphPair[0]}↔${morphPair[1]}`;
      slotsRow.classList.toggle('can-morph', ok);
      slotsRow.hidden = !scanned?.items.some((it) => it.key != null);
    }
    const mixHex = (a, b, t) => { const p = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); const x = p(a); const y = p(b); return `#${x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
    function lerpVals(from, to, t) {
      return from.map((v, i) => {
        const w = to[i]; const it = scanned.items[i];
        if (v === w) return v;
        if (it.kind === 'number') { const x = v + (w - v) * t; return it.int ? Math.round(x) : Number(x.toFixed(6)); }
        if (it.kind === 'color' && CSS_HEX.test(v) && CSS_HEX.test(w)) return mixHex(normHex(v), normHex(w), t);
        return t < 0.5 ? v : w;
      });
    }
    function morphTo(t, { release = false } = {}) {
      if (!scanned || !morphPair.every((x) => slots[x])) return false;
      morph.value = t;
      applyValues(lerpVals(slotValues(morphPair[0]), slotValues(morphPair[1]), Math.max(0, Math.min(1, t))), { remember: release });
      return true;
    }
    // Peek: the sketch shows other values while you hold (a slot), then yours again; nothing changes.
    let peeking = null;
    function peek(arr) {
      if (!scanned) return;
      const show = arr || values;
      const prev = peeking || values;
      peeking = arr;
      scanned.items.forEach((it, i) => {
        if (show[i] === prev[i]) return;
        send({ type: 'tweak', index: i, value: runtime(it, show[i]), call: it.call, key: it.key });
        rows.filter((r) => r.i === i).forEach((r) => r.set(show[i]));
      });
      root.classList.toggle('comparing', Boolean(arr));
    }

    // ---------- menus: Save ▾, ⋯, groups, copy / paste ----------
    function quickLook() { const name = `Look ${looks.length + 1}`; saveLookAs(name); toast(`Saved as "${name}" (right-click it to rename)`, { timeout: 1500 }); return name; }
    function saveMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const d = dirtyCount();
      menu(r.right - 280, r.bottom + 4, [
        ['Save into the code', d ? `${d} change${d === 1 ? '' : 's'} · Ctrl+S` : 'Nothing changed', () => save()],
        ['Save as a look (quick)', `"Look ${looks.length + 1}" · Shift+click Save`, () => quickLook()],
        ['Save as a look…', 'Pick a name · Ctrl+Shift+S', () => saveLook()],
        'Slots',
        ...SLOTS.map((n) => [`Store in slot ${n}`, slots[n] ? 'replaces it' : 'empty', () => slotSave(n)]),
        'Options',
        ['Auto-save', 'Write values into the code by themselves, a moment after you let go', () => { const on = !store.get('three.twAutosave', false); autoSaveBox.checked = on; autoSaveBox.dispatchEvent(new Event('change')); toast(`Auto-save ${on ? 'on' : 'off'}`, { timeout: 1000 }); }, store.get('three.twAutosave', false)],
      ]);
    }
    function moreMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const d = dirtyCount();
      menu(r.right - 280, r.bottom + 4, [
        'Values',
        ['Reset', d ? 'Back to the values in the code' : 'Nothing changed', () => reset(), false, 'Reset'],
        ['Undo the last slider change', undoStack.length ? `${undoStack.length} step${undoStack.length === 1 ? '' : 's'}` : 'Nothing to undo', () => undo(), false, 'Undo slider change'],
        ['Copy all values', 'As text you can paste here (or in another sketch / layer)', () => copyValues()],
        ['Copy as tweak() code', 'The controls with these values as defaults', () => { navigator.clipboard.writeText(tweakCode()); toast('tweak() code copied', { timeout: 1200 }); }],
        ['Halfway back to the code', 'Every change, half as far', () => tame(0.5)],
        ['Paste values', 'Sets every control the copied text names', () => pasteValues()],
        ['Lock everything', 'Shuffle, looks and resets leave them all alone', () => lockAll(true)],
        locks.size ? ['Unlock everything', `${locks.size} locked`, () => lockAll(false)] : null,
        modsCount() ? ['Stop every motion', `${modsCount()} moving by themselves`, () => { for (const id of Object.keys(motions)) delete motions[id]; persist?.('motions', motions); syncMotion(); rows.forEach((x) => x.updateMusic?.()); }] : null,
        'Show',
        ...[['auto', 'Auto: knobs for decimals'], ['knobs', 'Knobs for every number'], ['sliders', 'Sliders for every number']].map(([v, l]) => [l, '', () => { layout = v; layoutSel.value = v; store.set('three.twLayout', v); render(); }, layout === v, 'Knobs or sliders']),
        ['Only what I changed', '', () => { changedOnly = !changedOnly; changedBox.checked = changedOnly; applyFilter(); }, changedOnly],
        ['Values the sketch never reads', 'Hidden by default', () => { showUnused = !showUnused; unusedBox.checked = showUnused; applyFilter(); }, showUnused],
        ['One group open at a time', 'Opening a group folds the others', () => { accordionBox.checked = !accordionBox.checked; accordionBox.dispatchEvent(new Event('change')); }, accordionBox.checked],
        ['Fold every group', '', () => foldAll(true)], ['Unfold every group', '', () => foldAll(false)],
      ]);
    }
    function foldAll(fold) { for (const sec of body.querySelectorAll('.tw-sec')) { sec.open = !fold; if (fold) collapsed.add(sec.dataset.group); else collapsed.delete(sec.dataset.group); } store.set('three.twCollapsed', [...collapsed]); }
    function lockAll(on) { (scanned?.items || []).forEach((it, i) => { if (it.key == null) return; if (on) locks.add(ids[i]); else locks.delete(ids[i]); }); saveSets(); rows.forEach((x) => x.paintLock?.()); toast(on ? 'Every control is locked' : 'Everything unlocked', { timeout: 1200 }); }
    function groupMenu(e, g, idxs) {
      e.preventDefault();
      const named = idxs.filter((i) => scanned.items[i].key != null);
      menu(e.clientX, e.clientY, [g,
        ...AMOUNTS.map(([a, name]) => [`🎲 Shuffle ${name.toLowerCase()}`, `${Math.round(a * 100)}% of each range`, () => shuffle({ amount: a, only: idxs.filter((i) => !locks.has(ids[i])) })]),
        ['↺ Back to the code\'s values', '', () => resetGroup(idxs)],
        ['🔒 Lock the group', '', () => { named.forEach((i) => locks.add(ids[i])); saveSets(); rows.forEach((x) => x.paintLock?.()); }],
        ['🔓 Unlock the group', '', () => { named.forEach((i) => locks.delete(ids[i])); saveSets(); rows.forEach((x) => x.paintLock?.()); }],
        ['★ Add all to Favorites', '', () => { named.forEach((i) => favs.add(ids[i])); saveSets(); render(); }],
        ['Copy the group\'s values', '', () => copyValues(idxs)],
        ['∿ Make it breathe', 'Every number in the group moves on a slow wave (LFO, 2 bars)', () => idxs.filter((i) => scanned.items[i].kind === 'number').forEach((i, k) => setMotion(i, { kind: 'lfo', rate: 8 + k * 2, depth: 0.15 }))],
        ['∿ Pulse on the beat', 'Every number in the group jumps on each beat', () => idxs.filter((i) => scanned.items[i].kind === 'number').forEach((i) => setMotion(i, { kind: 'pulse', rate: 1, depth: 0.2 }))],
        idxs.some((i) => motions[ids[i]]) ? ['Still', 'Stop the group\'s motions', () => idxs.forEach((i) => { if (motions[ids[i]]) setMotion(i, null); })] : null,
        ['Only this group', 'Same as its chip above', () => setGroupFilter(g)],
      ]);
    }
    const LAB_TAG = 'hearth-lab-sliders';
    function copyValues(only = null) {
      if (!scanned) return '';
      const out = {};
      scanned.items.forEach((it, i) => { if (it.key != null && (!only || only.includes(i))) out[it.key] = values[i]; });
      const text = JSON.stringify({ [LAB_TAG]: 1, values: out });
      navigator.clipboard.writeText(text).catch(() => {});
      toast(`Copied ${Object.keys(out).length} values`, { timeout: 1200 });
      return text;
    }
    async function pasteValues(text) {
      let src = text;
      if (src == null) { try { src = await navigator.clipboard.readText(); } catch { src = ''; } }
      let obj = null;
      try { obj = JSON.parse(src); } catch { /* not JSON */ }
      const vals = obj?.values || obj;
      if (!vals || typeof vals !== 'object') { toast('No slider values in the clipboard (use Copy all values first)', { type: 'error' }); return []; }
      const done = setManyKeys(vals);
      toast(done.length ? `Pasted ${done.length} value${done.length === 1 ? '' : 's'} (↶ undoes)` : 'None of those sliders are in this layer', { timeout: 1600 });
      return done;
    }

    // Hold A/B: the sketch shows the code's values while held, then yours again (nothing is changed).
    let comparing = false;
    function compare(on) {
      if (!scanned || on === comparing) return;
      comparing = on;
      root.classList.toggle('comparing', on);
      scanned.items.forEach((it, i) => {
        const v = on ? it.orig : values[i];
        if (same(it, values[i])) return;
        send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
        rows.filter((r) => r.i === i).forEach((r) => r.set(v));
      });
    }
    // One group: nudge its values at random, or put them back to the code's.
    function shuffleGroup(idxs) { applyValues(shuffled(idxs)); }
    function resetGroup(idxs) { applyValues(values.map((v, i) => (idxs.includes(i) ? scanned.items[i].orig : v))); }
    function saveSets() { persist?.('locks', [...locks]); persist?.('favs', [...favs]); }
    function toggleLock(i) {
      if (locks.has(ids[i])) locks.delete(ids[i]); else locks.add(ids[i]);
      saveSets();
      rows.filter((r) => r.i === i).forEach((r) => r.paintLock?.());
    }
    function toggleFav(i) {
      if (favs.has(ids[i])) favs.delete(ids[i]); else favs.add(ids[i]);
      saveSets();
      render();
    }
    function resetOne(i) {
      const it = scanned.items[i];
      if (locks.has(ids[i])) return;
      rows.filter((r) => r.i === i).forEach((r) => r.set(it.orig));
      setValue(i, it.orig, { release: true });
    }
    const fmtVal = (it, v) => (it.kind === 'number' ? trimNum(v) : String(v));
    let clip = null; // one copied value: { kind, v }
    function rowMenu(e, it, i, r) {
      e.preventDefault();
      const locked = locks.has(ids[i]);
      const hist = (valHist[ids[i]] || []).filter((v) => v !== values[i]).slice(0, 6);
      const set = (v) => { rows.filter((x) => x.i === i).forEach((x) => x.set(v)); setValue(i, v, { release: true }); };
      menu(e.clientX, e.clientY, [
        labelOf(it) || it.raw,
        ['↺ Back to the code\'s value', fmtVal(it, it.orig), () => resetOne(i)],
        [locked ? '🔓 Unlock' : '🔒 Lock at this value', 'Shuffle, looks, resets and MIDI leave it alone', () => toggleLock(i)],
        ['🔒 Reset and lock', '', () => { if (locks.has(ids[i])) toggleLock(i); resetOne(i); toggleLock(i); }],
        [favs.has(ids[i]) ? '☆ Remove from Favorites' : '★ Add to Favorites', '', () => toggleFav(i)],
        it.key != null && it.kind !== 'bool' ? ['🎲 Shuffle just this one', '', () => shuffle({ only: [i] })] : null,
        !same(it, values[i]) ? ['💾 Save just this one', 'Into the code; your other changes stay', () => saveOne(i)] : null,
        it.kind === 'number' ? ['Type a value…', `now ${fmtVal(it, values[i])} · range ${trimNum(it.range.min)}…${trimNum(it.range.max)}`, async () => { const v = await Modal.prompt(labelOf(it) || 'Value', { value: fmtVal(it, values[i]) }); const x = Number(v); if (v != null && Number.isFinite(x)) set(it.int ? Math.round(x) : x); }] : null,
        ['Copy the value', fmtVal(it, values[i]), () => { clip = { kind: it.kind, v: values[i] }; navigator.clipboard.writeText(fmtVal(it, values[i])).catch(() => {}); }],
        clip && clip.kind === it.kind ? ['Paste the value', fmtVal(it, clip.v), () => set(clip.v)] : null,
        hist.length ? 'History (click to go back)' : null,
        ...hist.map((v) => [fmtVal(it, v), '', () => set(v)]),
        it.kind === 'number' ? 'Moves' : null,
        ...(r.musicPanel ? [['♪ Follow the music / move by itself…', bindings[ids[i]] ? `follows ${BAND_NAME[bindings[ids[i]].band]}` : motions[ids[i]] ? MOTION_NAME[motions[ids[i]].kind] : 'bass, kick, LFO, random walk…', () => { r.musicPanel.hidden = false; r.paintMusic?.(); }]] : []),
        ...(it.kind === 'number' ? MOTIONS.filter(([k]) => k).map(([k, name, hint]) => [`${motions[ids[i]]?.kind === k ? '● ' : ''}${name}`, hint, () => setMotion(i, motions[ids[i]]?.kind === k ? null : { kind: k })]) : []),
        ...(keyframes && it.key != null && (it.kind === 'number' || it.kind === 'color') ? [['◆ Keyframe at the playhead', '', () => { keyframes.toggle(it.key, values[i]); r.paintKey?.(); }]] : []),
        learn && it.key != null ? ['🎛 Map to a MIDI knob…', 'Then turn the knob or fader', () => learn(it.key, labelOf(it))] : null,
        [`Show line ${it.line} in the code`, '', () => goToLine(it.line)],
      ]);
    }

    // ---------- looks: named sets of values you can click between ----------
    function renderLooks() {
      looksBar.replaceChildren();
      if (!scanned?.items.length) return;
      for (const look of looks) {
        const chip = el('span', { class: 'tw-look' },
          el('button', { class: 'tw-look-apply', text: look.name, title: `Switch to "${look.name}" (↶ to undo) · Alt+click: morph into it`, on: { click: (e) => (e.altKey ? morphLook(look) : applyLook(look)) } }),
          el('button', { class: 'tw-look-x', text: '×', title: `Delete "${look.name}"`, on: { click: () => { looks = looks.filter((l) => l !== look); persist?.('looks', looks); renderLooks(); } } }));
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showMenu(e.clientX, e.clientY, [
            { label: 'Morph into it (1 s)', action: () => morphLook(look) },
            { label: 'Update with the current values', action: () => { saveLookAs(look.name); toast(`"${look.name}" updated`, { timeout: 1400 }); } },
            { label: 'Store in slot A / B / C…', action: () => {
              const r0 = chip.getBoundingClientRect();
              const lookVals = values.map((v, i) => (ids[i] in look.values ? look.values[ids[i]] : v));
              menu(r0.left, r0.bottom + 4, ['Store the look in', ...SLOTS.map((n) => [`Slot ${n}`, slots[n] ? 'replaces it' : 'empty', () => { const keep = values; values = lookVals; slotSave(n); values = keep; }])]);
            } },
            { label: 'Rename…', action: async () => { const v = await Modal.prompt('Look name', { value: look.name }); if (v?.trim()) { look.name = v.trim().slice(0, 40); persist?.('looks', looks); renderLooks(); } } },
            { label: 'Duplicate', action: () => { looks.push({ name: `${look.name} copy`, values: { ...look.values } }); persist?.('looks', looks); renderLooks(); } },
            { label: `Delete "${look.name}"`, danger: true, action: () => { looks = looks.filter((l) => l !== look); persist?.('looks', looks); renderLooks(); } },
          ]);
        });
        chip.title = 'Click: switch to it · right-click: update, rename, duplicate, delete';
        looksBar.append(chip);
      }
      looksBar.append(el('button', { class: 'tw-chip add', text: '＋ Save look', title: 'Remember the current slider values as a look you can switch back to with one click', on: { click: saveLook } }));
    }
    async function saveLook() {
      const name = await Modal.prompt('Save look', { value: `Look ${looks.length + 1}`, placeholder: 'e.g. Calm intro, Drop, Neon' });
      if (!name?.trim()) return;
      saveLookAs(name);
    }
    function saveLookAs(name) {
      const v = {};
      scanned.items.forEach((it, i) => { if (it.key != null || !same(it, values[i])) v[ids[i]] = values[i]; });
      looks = looks.filter((l) => l.name !== name.trim()).concat({ name: name.trim(), values: v });
      persist?.('looks', looks);
      renderLooks();
    }
    // A look played on top of your values (song cues): it morphs in, only for values that change live, and is
    // never saved or shown as a change; endLook() goes back to your sliders.
    let played = null; // { cur, sent, raf }
    function sendPlayed(arr) {
      arr.forEach((v, i) => {
        if (v === played.sent[i] || locks.has(ids[i]) || needsRebuild(i)) return;
        played.sent[i] = v;
        const it = scanned.items[i];
        send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
      });
    }
    function playLook(name, fade = 450) {
      const look = looks.find((l) => l.name === name);
      if (!look || !scanned) return false;
      const from = (played?.cur || values).slice();
      const to = values.slice();
      ids.forEach((id, i) => { if (id in look.values) to[i] = look.values[id]; });
      cancelAnimationFrame(played?.raf);
      played = { cur: from.slice(), sent: played?.sent || values.slice(), raf: 0, name };
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / fade); const e = k * k * (3 - 2 * k);
        played.cur = to.map((v, i) => (typeof v === 'number' && typeof from[i] === 'number' ? from[i] + (v - from[i]) * e : k < 0.5 ? from[i] : v));
        sendPlayed(played.cur);
        if (k < 1) played.raf = requestAnimationFrame(step);
      };
      step();
      return true;
    }
    function endLook() {
      if (!played) return;
      cancelAnimationFrame(played.raf);
      const p = played; played = { ...p, cur: values.slice() };
      sendPlayed(values);
      played = null;
    }
    // a look, morphed in over `ms` (your values, undoable once it lands)
    function morphLook(look, ms = 1000) {
      const from = values.slice(); const to = values.slice();
      ids.forEach((id, i) => { if (id in look.values) to[i] = look.values[id]; });
      const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); const e = k * k * (3 - 2 * k); applyValues(lerpVals(from, to, e), { remember: k >= 1 }); if (k < 1) requestAnimationFrame(step); };
      step();
      toast(`Morphing into "${look.name}"`, { timeout: 1200 });
    }
    function lookStep(d) {
      if (!looks.length) return null;
      const cur = looks.findIndex((l) => ids.every((id, i) => !(id in l.values) || l.values[id] === values[i]));
      const next = d === 'random' ? looks[Math.floor(Math.random() * looks.length)] : looks[((cur < 0 ? (d > 0 ? -1 : 0) : cur) + d + looks.length) % looks.length];
      applyLook(next);
      return next.name;
    }
    function applyLook(look) {
      const next = values.slice();
      ids.forEach((id, i) => { if (id in look.values) next[i] = look.values[id]; });
      applyValues(next);
      toast(`Look "${look.name}"`, { timeout: 1500 });
    }

    // ---------- music links: a slider moves with bass / mids / highs / loudness / beat ----------
    function modsNow() {
      const mods = {};
      if (!scanned) return mods;
      scanned.items.forEach((it, i) => {
        const b = bindings[ids[i]];
        if (b?.band && it.kind === 'number') mods[i] = { band: b.band, amount: b.amount, span: it.range.max - it.range.min, int: it.int };
      });
      return mods;
    }
    function setBinding(i, band, amount) {
      if (band) bindings[ids[i]] = { band, amount }; else delete bindings[ids[i]];
      persist?.('bindings', bindings);
      send({ type: 'tweak-mods', mods: modsNow() });
      const r = rows.find((x) => x.i === i);
      if (r) r.updateMusic();
    }
    function musicPanel(it, i, row) {
      const panel = el('div', { class: 'tw-bind', hidden: true });
      const b = () => bindings[ids[i]];
      const amount = el('input', { type: 'range', min: -1, max: 1, step: 0.01, value: b()?.amount ?? 0.5, title: 'How far the music pushes this slider (negative = the other way)' });
      const pct = el('span', { class: 'tw-bind-pct' });
      const bandBtns = [['', 'Off'], ...BANDS].map(([band, name]) => el('button', {
        class: 'tw-chip', text: name, on: { click: () => { setBinding(i, band, Number(amount.value)); paint(); } },
      }));
      const note = el('div', { class: 'tw-hint' });
      function paint() {
        const cur = b()?.band || '';
        bandBtns.forEach((x, k) => x.classList.toggle('on', ([['', 'Off'], ...BANDS][k][0]) === cur));
        pct.textContent = `${Math.round(Number(amount.value) * 100)}%`;
        amount.disabled = !cur;
        note.textContent = cur && reads && !reads.live.has(i) ? 'This value is only used when the scene is built, so it can\'t follow the music. Ask the director to read it every frame.' : '';
      }
      amount.addEventListener('input', () => { if (b()) setBinding(i, b().band, Number(amount.value)); paint(); });
      // Moves by itself: an LFO, a random walk, steps or pulses on the beat, or the song's quiet / loud sections.
      const m = () => motions[ids[i]];
      const kindBtns = MOTIONS.map(([k, name, hint]) => el('button', { class: 'tw-chip', text: k ? name.split(' (')[0] : 'Still', title: hint, on: { click: () => { setMotion(i, k ? { ...(m() || {}), kind: k } : null); paintMotion(); } } }));
      const shapeSel = el('select', { class: 'tw-msel', title: 'Wave shape' }, [['sine', '∿ Sine'], ['tri', '⋀ Triangle'], ['saw', '⟋ Saw'], ['square', '⊓ Square']].map(([v, l]) => el('option', { value: v, text: l })));
      const rateSel = el('select', { class: 'tw-msel', title: 'How long one cycle / step lasts, in beats' }, RATES.map(([v, l]) => el('option', { value: v, text: l })));
      const depth = el('input', { type: 'range', min: 0, max: 1, step: 0.01, title: 'How far it moves, of the slider\'s range' });
      const depthPct = el('span', { class: 'tw-bind-pct' });
      const mNote = el('div', { class: 'tw-hint' });
      shapeSel.addEventListener('change', () => { if (m()) setMotion(i, { ...m(), shape: shapeSel.value }); });
      rateSel.addEventListener('change', () => { if (m()) setMotion(i, { ...m(), rate: Number(rateSel.value) }); });
      depth.addEventListener('input', () => { if (m()) setMotion(i, { ...m(), depth: Number(depth.value) }); depthPct.textContent = `${Math.round(Number(depth.value) * 100)}%`; });
      const mRow = el('div', { class: 'tw-num-row tw-mrow' }, shapeSel, rateSel, depth, depthPct);
      function paintMotion() {
        const cur = m();
        kindBtns.forEach((x, k) => x.classList.toggle('on', (MOTIONS[k][0] || null) === (cur?.kind || null)));
        mRow.hidden = !cur;
        if (cur) { shapeSel.value = cur.shape || 'sine'; shapeSel.hidden = cur.kind !== 'lfo'; rateSel.value = String(cur.rate ?? motionDefaults(cur.kind).rate); rateSel.hidden = cur.kind === 'section'; depth.value = cur.depth ?? 0.25; depthPct.textContent = `${Math.round((cur.depth ?? 0.25) * 100)}%`; }
        mNote.textContent = cur && reads && !reads.live.has(i) ? 'Only used when the scene is built, so it can\'t move by itself.' : '';
      }
      panel.append(el('div', { class: 'tw-bind-k', text: '♪ Follow the music' }), el('div', { class: 'tw-bind-bands' }, ...bandBtns), el('div', { class: 'tw-num-row' }, el('span', { class: 'tw-hint', text: 'Amount' }), amount, pct), note,
        el('div', { class: 'tw-bind-k', text: '∿ Move by itself' }), el('div', { class: 'tw-bind-bands' }, ...kindBtns), mRow, mNote);
      paint(); paintMotion();
      return { panel, paint: () => { paint(); paintMotion(); } };
    }

    // ---------- motion: a control that moves by itself (runs here, ~30 times a second, on top of your value) ----------
    // motions[id] = { kind: 'lfo' | 'walk' | 'beat' | 'pulse' | 'section', shape, rate (beats per cycle), depth (0..1 of the range) }
    let motions = {};
    let motionTimer = 0;
    const walkState = {};
    const motionSent = {};
    const modsCount = () => Object.keys(motions).length;
    function setMotion(i, mo) {
      const id = ids[i];
      if (mo) motions[id] = { ...motionDefaults(mo.kind), ...mo }; else { delete motions[id]; delete walkState[i]; resend(i); }
      persist?.('motions', motions);
      syncMotion();
      rows.filter((r) => r.i === i).forEach((r) => r.updateMusic?.());
    }
    function resend(i) { const it = scanned?.items[i]; if (!it) return; const v = played?.cur?.[i] ?? values[i]; delete motionSent[i]; send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key }); }
    function syncMotion() {
      const on = (modsCount() > 0 || autoMorph > 0) && !root.hidden && Boolean(scanned);
      if (on && !motionTimer) motionTimer = setInterval(motionTick, 33);
      if (!on && motionTimer) { clearInterval(motionTimer); motionTimer = 0; Object.keys(motionSent).forEach((i) => resend(Number(i))); }
    }
    const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    function motionTick() {
      if (!scanned || peeking || comparing) return;
      const c = clock?.() || { t: performance.now() / 1000, bpm: 120 };
      const beatPos = c.t / (60 / (c.bpm || 120));
      const morphed = morphTick(c);
      if (morphed) scanned.items.forEach((it, i) => {
        if (motions[ids[i]] || locks.has(ids[i]) || needsRebuild(i) || morphed[i] === morphSent[i]) return;
        morphSent[i] = morphed[i];
        send({ type: 'tweak', index: i, value: runtime(it, morphed[i]), call: it.call, key: it.key });
      });
      else if (Object.keys(morphSent).length) { Object.keys(morphSent).forEach((i) => resend(Number(i))); for (const k of Object.keys(morphSent)) delete morphSent[k]; }
      scanned.items.forEach((it, i) => {
        const mo = motions[ids[i]];
        if (!mo || it.kind !== 'number' || locks.has(ids[i])) return;
        const span = it.range.max - it.range.min; const depth = mo.depth ?? 0.25; const rate = mo.rate || 1;
        const ph = ((beatPos / rate) % 1 + 1) % 1;
        let u = 0;
        if (mo.kind === 'lfo') u = mo.shape === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : mo.shape === 'saw' ? ph * 2 - 1 : mo.shape === 'square' ? (ph < 0.5 ? 1 : -1) : Math.sin(ph * Math.PI * 2);
        else if (mo.kind === 'walk') { const s = (walkState[i] ||= { x: 0, v: 0 }); s.v = (s.v + (Math.random() - 0.5) * 0.06 / rate) * 0.94; s.x = Math.max(-1, Math.min(1, s.x + s.v)); if (Math.abs(s.x) >= 1) s.v *= -0.5; u = s.x; }
        else if (mo.kind === 'beat') u = hash01(Math.floor(beatPos / rate) * 13 + i) * 2 - 1;
        else if (mo.kind === 'pulse') u = Math.exp(-ph * 6);
        else if (mo.kind === 'section') { const s = (walkState[i] ||= { x: 0 }); const target = c.section === 'loud' ? 1 : c.section === 'quiet' ? -1 : 0; s.x += (target - s.x) * 0.05; u = s.x; }
        const base = morphed?.[i] ?? played?.cur?.[i] ?? values[i];
        let v = Math.max(it.range.min, Math.min(it.range.max, base + u * depth * span));
        if (it.int) v = Math.round(v);
        if (motionSent[i] != null && Math.abs(v - motionSent[i]) < span * 2e-4) return;
        motionSent[i] = v;
        send({ type: 'tweak', index: i, value: v, call: it.call, key: it.key });
      });
    }

    // ---------- controls ----------
    function control(it, i) {
      const v = values[i];
      if (it.kind === 'bool') {
        // one click: an On / Off pill
        let on = Boolean(v);
        const pill = el('button', { type: 'button', class: 'tw-toggle', dataset: { feature: labelOf(it) || 'Switch' } });
        const set = (x) => { on = Boolean(x); pill.classList.toggle('on', on); pill.textContent = on ? 'On' : 'Off'; };
        pill.addEventListener('click', () => { if (locks.has(ids[i])) return; set(!on); setValue(i, on, { release: true }); });
        set(on);
        return { node: pill, set };
      }
      if (it.kind === 'choice') {
        const opts = it.options?.length ? [...new Set([...it.options, v])] : [v];
        const pickIdx = (cur, d) => opts[(opts.indexOf(cur) + d + opts.length) % opts.length];
        // A few short options: one click each (segmented). Many or long ones: a dropdown. The wheel cycles both.
        if (opts.length <= 5 && opts.every((o) => humanize(o).length <= 12)) {
          let cur = v;
          const segs = opts.map((o) => el('button', { type: 'button', class: 'tw-seg-btn', text: humanize(o), dataset: { feature: `${labelOf(it) || 'Choice'}: ${humanize(o)}` } }));
          const set = (x) => { cur = x; segs.forEach((b, k) => b.classList.toggle('on', opts[k] === x)); };
          segs.forEach((b, k) => b.addEventListener('click', () => { if (locks.has(ids[i])) return; set(opts[k]); setValue(i, opts[k], { release: true }); }));
          const node = el('div', { class: 'tw-seg' }, segs);
          node.addEventListener('wheel', (e) => { if (locks.has(ids[i])) return; e.preventDefault(); const x = pickIdx(cur, e.deltaY > 0 ? 1 : -1); set(x); setValue(i, x, { release: true }); }, { passive: false });
          set(v);
          return { node, set };
        }
        const sel = el('select', { class: 'tw-select', title: labelOf(it) || '', dataset: { feature: labelOf(it) || 'Choice' } }, opts.map((o) => el('option', { value: o, text: humanize(o), selected: o === v })));
        sel.addEventListener('change', () => setValue(i, sel.value, { release: true }));
        const prev = el('button', { type: 'button', class: 'tw-step', text: '‹', title: 'Previous option' });
        const next = el('button', { type: 'button', class: 'tw-step', text: '›', title: 'Next option' });
        const step = (d) => { if (locks.has(ids[i])) return; sel.value = pickIdx(sel.value, d); setValue(i, sel.value, { release: true }); };
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        sel.addEventListener('wheel', (e) => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
        return { node: el('div', { class: 'tw-choice' }, prev, sel, next), set: (x) => { sel.value = x; } };
      }
      if (it.kind === 'color') {
        const pick = el('input', { type: 'color', value: v });
        const hex = el('input', { type: 'text', class: 'tw-hex', value: v, spellcheck: false });
        pick.addEventListener('input', () => { hex.value = pick.value; setValue(i, pick.value); });
        pick.addEventListener('change', () => setValue(i, pick.value, { release: true }));
        hex.addEventListener('change', () => { const h = hex.value.trim(); if (CSS_HEX.test(h)) { pick.value = normHex(h); setValue(i, normHex(h), { release: true }); } else hex.value = pick.value; });
        return { node: el('div', { class: 'tw-color' }, pick, hex), set: (x) => { pick.value = x; hex.value = x; } };
      }
      const r = it.range;
      const slider = el('input', { type: 'range', min: r.min, max: r.max, step: r.step, value: v, title: 'Clicks into the value in the code as you pass it · double-click to go back to it' });
      const num = el('input', { type: 'number', class: 'tw-num', step: r.step, value: it.int ? v : trimNum(v) });
      // a tick where the code's value sits, and a detent there (like a center-click knob)
      const tick = el('i', { class: 'tw-orig' });
      const placeTick = () => { const lo = Number(slider.min); const hi = Number(slider.max); tick.style.left = `calc(7px + (100% - 14px) * ${(it.orig - lo) / ((hi - lo) || 1)})`; };
      const widen = (x) => { if (x < Number(slider.min)) slider.min = x; if (x > Number(slider.max)) slider.max = x; placeTick(); };
      placeTick();
      slider.addEventListener('input', () => {
        let x = Number(slider.value);
        if (Math.abs(x - it.orig) <= (Number(slider.max) - Number(slider.min)) * 0.025) { x = it.orig; slider.value = x; }
        wrap.classList.toggle('at-orig', x === it.orig);
        num.value = it.int ? x : trimNum(x);
        setValue(i, x);
      });
      slider.addEventListener('change', () => setValue(i, Number(slider.value), { release: true }));
      // Shift / Alt + arrows: finer steps than the slider's own
      slider.addEventListener('keydown', (e) => {
        if (!/^Arrow/.test(e.key) || !(e.shiftKey || e.altKey) || locks.has(ids[i])) return;
        e.preventDefault(); e.stopPropagation();
        const d = ((r.max - r.min) / (e.altKey ? 2000 : 400)) * (/Up|Right/.test(e.key) ? 1 : -1);
        const x = it.int ? Math.round(values[i] + Math.sign(d)) : Number((values[i] + d).toPrecision(6));
        num.value = it.int ? x : trimNum(x); slider.value = x;
        setValue(i, x, { release: true });
      });
      num.addEventListener('change', () => { const x = Number(num.value); if (!Number.isFinite(x)) return; widen(x); slider.value = x; setValue(i, it.int ? Math.round(x) : x, { release: true }); });
      slider.addEventListener('dblclick', () => { widen(it.orig); slider.value = it.orig; num.value = it.int ? it.orig : trimNum(it.orig); setValue(i, it.orig, { release: true }); });
      const wrap = el('div', { class: 'tw-range' }, slider, tick);
      return { node: el('div', { class: 'tw-num-row' }, wrap, num), set: (x) => { widen(x); slider.value = x; num.value = it.int ? x : trimNum(x); wrap.classList.toggle('at-orig', x === it.orig); } };
    }

    // Drag a number's name sideways to scrub it (Shift: 10× finer, Alt: 100× finer), like Blender / After Effects.
    function scrubbable(node, it, i) {
      if (it.kind !== 'number') return;
      node.classList.add('tw-scrub');
      node.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || locks.has(ids[i])) return;
        const x0 = e.clientX; const v0 = values[i]; let moved = false; let last = v0;
        const span = (it.range.max - it.range.min) || 1;
        try { node.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
        const move = (ev) => {
          const dx = ev.clientX - x0;
          if (!moved && Math.abs(dx) < 3) return;
          moved = true;
          document.body.classList.add('tw-scrubbing');
          let v = v0 + (dx / 260) * span * (ev.altKey ? 0.01 : ev.shiftKey ? 0.1 : 1);
          v = Math.max(it.range.min, Math.min(it.range.max, v));
          v = it.int ? Math.round(v) : Number(v.toPrecision(5));
          if (v === last) return;
          last = v;
          rows.filter((x) => x.i === i).forEach((x) => x.set(v));
          setValue(i, v);
        };
        const up = () => { node.removeEventListener('pointermove', move); document.body.classList.remove('tw-scrubbing'); if (moved) setValue(i, last, { release: true }); };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', up, { once: true });
        node.addEventListener('pointercancel', up, { once: true });
      });
    }

    // Numbers as knobs: drag up / down (or sideways), Shift for fine, wheel or arrow keys to step. The knob clicks
    // into the code's value as you pass it (a detent, shown as a notch); double-click goes back there.
    const KNOB_R = 17; const KNOB_C = 2 * Math.PI * KNOB_R; const KNOB_ARC = KNOB_C * 0.75;
    function knobCell(it, i) {
      const rg = it.range;
      let lo = rg.min; let hi = rg.max;
      const NS = 'http://www.w3.org/2000/svg';
      const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
      const svg = svgEl('svg', { viewBox: '0 0 48 48', class: 'tw-knob', tabindex: '0' });
      const track = svgEl('circle', { cx: 24, cy: 24, r: KNOB_R, class: 'kn-track', 'stroke-dasharray': `${KNOB_ARC} ${KNOB_C}`, transform: 'rotate(135 24 24)' });
      const arc = svgEl('circle', { cx: 24, cy: 24, r: KNOB_R, class: 'kn-arc', transform: 'rotate(135 24 24)' });
      const notch = svgEl('line', { x1: 24, y1: 3, x2: 24, y2: 8, class: 'kn-notch' });
      const cap = svgEl('circle', { cx: 24, cy: 24, r: 12, class: 'kn-cap' });
      const ptr = svgEl('line', { x1: 24, y1: 24, x2: 24, y2: 14, class: 'kn-ptr' });
      svg.append(track, arc, notch, cap, ptr);
      const valEl = el('button', { class: 'tw-kval', title: 'Click to type a value' });
      const frac = (x) => Math.max(0, Math.min(1, (x - lo) / ((hi - lo) || 1)));
      const ang = (x) => -135 + frac(x) * 270;
      let cur = values[i];
      function paint(x) {
        cur = x;
        arc.setAttribute('stroke-dasharray', `${Math.max(0.001, frac(x) * KNOB_ARC)} ${KNOB_C}`);
        ptr.setAttribute('transform', `rotate(${ang(x)} 24 24)`);
        notch.setAttribute('transform', `rotate(${ang(it.orig)} 24 24)`);
        valEl.textContent = it.int ? String(Math.round(x)) : trimNum(Number(x).toPrecision(3));
        cell.classList.toggle('at-orig', Math.abs(x - it.orig) < 1e-9);
      }
      // Detent: near the code's value the knob clicks into it, and stays there until you turn clearly past.
      const zone = () => Math.max((hi - lo) * 0.035, it.int ? 1.5 : rg.step * 1.5);
      let held = false;
      const quant = (x, dragging = false) => {
        x = Math.max(lo, Math.min(hi, x));
        const d = Math.abs(x - it.orig);
        if (d <= zone() || (dragging && held && d <= zone() * 2.2)) { held = dragging; return it.orig; }
        held = false;
        return it.int ? Math.round(x) : Number((Math.round(x / rg.step) * rg.step).toFixed(6));
      };
      const commit = (x, release) => { paint(x); setValue(i, x, { release }); };
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || locks.has(ids[i])) return;
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        svg.focus();
        const y0 = e.clientY; const x0 = e.clientX; const v0 = cur;
        cell.classList.add('turning');
        const move = (ev) => {
          const d = ((y0 - ev.clientY) + (ev.clientX - x0) * 0.5) / 160;
          commit(quant(v0 + d * (hi - lo) * (ev.altKey ? 0.03 : ev.shiftKey ? 0.15 : 1), true), false);
        };
        const up = () => { svg.removeEventListener('pointermove', move); cell.classList.remove('turning'); held = false; commit(cur, true); };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerup', up, { once: true });
      });
      svg.addEventListener('dblclick', () => resetOne(i));
      svg.addEventListener('wheel', (e) => {
        if (locks.has(ids[i])) return;
        e.preventDefault();
        const stepBy = it.int ? 1 : (hi - lo) / (e.altKey ? 2000 : e.shiftKey ? 400 : 100);
        commit(quant(cur + (e.deltaY < 0 ? stepBy : -stepBy)), true);
      }, { passive: false });
      svg.addEventListener('keydown', (e) => {
        if (!/^Arrow(Up|Down|Left|Right)$/.test(e.key) || locks.has(ids[i])) return;
        e.preventDefault(); e.stopPropagation();
        const stepBy = it.int ? 1 : (hi - lo) / (e.altKey ? 2000 : e.shiftKey ? 400 : 100);
        commit(quant(cur + (/Up|Right/.test(e.key) ? stepBy : -stepBy)), true);
      });
      valEl.addEventListener('click', () => {
        if (locks.has(ids[i])) return;
        const inp = el('input', { type: 'number', class: 'tw-kedit', value: it.int ? Math.round(cur) : trimNum(cur), step: rg.step });
        valEl.replaceWith(inp);
        inp.focus(); inp.select();
        const done = (ok) => {
          if (!inp.isConnected) return;
          inp.replaceWith(valEl);
          const x = Number(inp.value);
          if (ok && Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; commit(it.int ? Math.round(x) : x, true); }
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
        inp.addEventListener('blur', () => done(true));
      });
      const cell = el('div', { class: 'tw-knob-cell' });
      paint(cur);
      return { cell, svg, valEl, set: (x) => { if (x < lo) lo = x; if (x > hi) hi = x; paint(x); } };
    }
    const asKnob = (it) => it.kind === 'number' && layout !== 'sliders' && (layout === 'knobs' || !it.int || it.range.max - it.range.min <= 32);
    function knobRow(it, i) {
      const k = knobCell(it, i);
      const badge = el('span', { class: 'tw-badge' });
      const r = { it, i, badge, set: k.set, text: `${labelOf(it) || ''} ${it.hint || ''} ${it.group || ''} ${it.lineText}`.toLowerCase(), knob: true };
      const name = el('span', { class: 'tw-kname', text: labelOf(it) || it.raw, title: [labelOf(it), it.hint, `line ${it.line}`, 'Drag sideways to scrub (Shift fine, Alt finer)'].filter(Boolean).join('\n') });
      scrubbable(name, it, i);
      const icons = el('span', { class: 'tw-kicons' });
      const music = el('button', { class: 'tw-music-btn', text: '♪', title: 'Follow the music' });
      const { panel, paint } = musicPanel(it, i, r);
      panel.classList.add('tw-kpanel');
      music.addEventListener('click', () => { panel.hidden = !panel.hidden; paint(); });
      r.updateMusic = () => { const b = bindings[ids[i]]; const mo = motions[ids[i]]; music.textContent = mo && !b ? '∿' : '♪'; music.title = [b ? `Follows ${BAND_NAME[b.band]}` : '', mo ? `Moves by itself: ${MOTION_NAME[mo.kind]}` : ''].filter(Boolean).join(' · ') || 'Follow the music or move by itself'; music.classList.toggle('on', Boolean(b || mo)); k.cell.classList.toggle('music', Boolean(b || mo)); };
      r.paintMusic = paint;
      r.musicPanel = panel;
      icons.append(music);
      if (keyframes && it.key != null) {
        const kb = el('button', { class: 'kf-btn', type: 'button' });
        r.paintKey = () => { const stt = keyframes.state(it.key); kb.textContent = stt === 'on' ? '◆' : '◇'; kb.className = `kf-btn kf-${stt}`; kb.title = stt === 'on' ? 'Remove this keyframe' : 'Keyframe at the playhead'; };
        kb.addEventListener('click', () => { keyframes.toggle(it.key, r.current ?? values[i]); r.paintKey(); });
        r.paintKey();
        icons.prepend(kb);
      }
      const lockMark = el('span', { class: 'tw-lockmark', text: '🔒', title: 'Locked: right-click → Unlock' });
      r.paintLock = () => { const on = locks.has(ids[i]); k.cell.classList.toggle('locked', on); lockMark.hidden = !on; };
      icons.append(badge);
      k.cell.append(el('div', { class: 'tw-ktop' }, name), k.svg, el('div', { class: 'tw-kfoot' }, k.valEl, icons, lockMark));
      k.cell.addEventListener('contextmenu', (e) => rowMenu(e, it, i, r));
      r.el = k.cell;
      r.panelEl = panel;
      r.updateMusic();
      r.paintLock();
      rows.push(r);
      return r;
    }

    function row(it, i) {
      const ctl = control(it, i);
      const badge = el('span', { class: 'tw-badge' });
      const named = it.key != null || it.label;
      const label = named || it.name
        ? el('span', { class: 'tw-name', text: labelOf(it), title: [it.hint, it.lineText].filter(Boolean).join('\n') })
        : el('code', { class: 'tw-snippet', title: it.lineText }, it.before, el('b', { text: it.raw }), it.after);
      const top = el('div', { class: 'tw-top' }, label);
      scrubbable(label, it, i);
      const r = { it, i, badge, set: ctl.set, text: `${labelOf(it) || ''} ${it.hint || ''} ${it.group || ''} ${it.lineText}`.toLowerCase() };
      if (it.kind === 'number') {
        const music = el('button', { class: 'tw-music-btn', text: '♪', title: 'Make this slider follow the music (bass, mids, highs, loudness or the beat)' });
        const { panel, paint } = musicPanel(it, i, r);
        music.addEventListener('click', () => { panel.hidden = !panel.hidden; paint(); });
        r.updateMusic = () => {
          const b = bindings[ids[i]]; const mo = motions[ids[i]];
          music.textContent = [b ? `♪ ${BAND_NAME[b.band]}` : '', mo ? `∿ ${MOTION_NAME[mo.kind].split(' ')[0]}` : ''].filter(Boolean).join(' ') || '♪';
          music.classList.toggle('on', Boolean(b || mo));
        };
        r.updateMusic();
        r.paintMusic = paint;
        top.append(music);
        r.musicPanel = panel;
      }
      if (keyframes && it.key != null && (it.kind === 'number' || it.kind === 'color')) {
        const kb = el('button', { class: 'kf-btn', type: 'button' });
        r.paintKey = () => {
          const stt = keyframes.state(it.key);
          kb.textContent = stt === 'on' ? '◆' : '◇';
          kb.className = `kf-btn kf-${stt}`;
          kb.title = stt === 'on' ? 'Remove this keyframe' : stt === 'animated' ? 'Add a keyframe here (it\'s animated: moving the slider also adds one)' : 'Animate this slider: add a keyframe at the playhead';
        };
        kb.addEventListener('click', () => { keyframes.toggle(it.key, r.current ?? values[i]); r.paintKey(); });
        r.paintKey();
        label.before(kb);
      }
      const lockBtn = el('button', { class: 'tw-lock', type: 'button' });
      r.paintLock = () => { const on = locks.has(ids[i]); lockBtn.textContent = on ? '🔒' : '🔓'; lockBtn.title = on ? 'Locked at this value: click to unlock' : 'Lock at this value (sliders, shuffle, looks and MIDI leave it alone)'; r.el?.classList.toggle('locked', on); };
      lockBtn.addEventListener('click', () => toggleLock(i));
      top.append(badge, lockBtn, el('button', { class: 'tw-line', text: `L${it.line}`, title: `Show line ${it.line} in the code`, on: { click: () => goToLine(it.line) } }));
      r.el = el('div', { class: `tw-row kind-${it.kind}${named ? ' named' : ''}` }, top, it.hint ? el('div', { class: 'tw-hint', text: it.hint }) : null, ctl.node, r.musicPanel || null);
      r.el.addEventListener('contextmenu', (e) => { if (!e.target.closest('input[type=text], input[type=number]')) rowMenu(e, it, i, r); });
      r.paintLock();
      rows.push(r);
      return r.el;
    }

    function render() {
      rows.length = 0;
      body.replaceChildren();
      renderLooks();
      if (!scanned) return;
      const items = scanned.items;
      count.textContent = items.length ? `${items.length}` : '';
      if (!items.length) {
        body.append(el('div', { class: 'tw-empty' }, el('p', { text: 'No numbers or colors in this sketch yet.' })));
        refreshState();
        return;
      }
      const all = items.map((it, i) => [it, i]);
      const named = all.filter(([it]) => it.key != null);
      const colors = all.filter(([it]) => it.key == null && it.kind === 'color');
      const numbers = all.filter(([it]) => it.key == null && it.kind === 'number');
      const section = (title, list) => [el('div', { class: 'tw-group', text: title }), ...list.map(([it, i]) => row(it, i))];
      // A named group: a foldable section with knobs in a grid, then the other controls; 🎲 and ↺ act on it alone.
      const groupSection = (g, list) => {
        const idxs = list.map(([, i]) => i);
        const knobs = list.filter(([it]) => asKnob(it));
        const others = list.filter(([it]) => !asKnob(it));
        const changed = () => idxs.filter((i) => !same(scanned.items[i], values[i])).length;
        const badgeEl = el('span', { class: 'tw-sec-changed' });
        const sum = el('summary', { class: 'tw-sec-head' }, el('span', { class: 'tw-sec-name', text: g }), el('span', { class: 'tw-sec-count', text: String(list.length) }), badgeEl, el('span', { class: 'spacer' }),
          el('button', { class: 'tw-sec-btn', text: '🎲', title: `Shuffle only "${g}"`, on: { click: (e) => { e.preventDefault(); shuffleGroup(idxs); } } }),
          el('button', { class: 'tw-sec-btn', text: '↺', title: `Put "${g}" back to the code's values`, on: { click: (e) => { e.preventDefault(); resetGroup(idxs); } } }));
        const det = el('details', { class: 'tw-sec', dataset: { group: g } }, sum);
        sum.title = `${g}: click to fold · right-click: shuffle amounts, reset, lock, favorites, copy`;
        sum.addEventListener('contextmenu', (e) => groupMenu(e, g, idxs));
        det.open = !collapsed.has(g);
        det.addEventListener('toggle', () => {
          if (det.open) collapsed.delete(g); else collapsed.add(g);
          if (det.open && store.get('three.twAccordion', false)) for (const other of body.querySelectorAll('.tw-sec[open]')) if (other !== det) { other.open = false; collapsed.add(other.dataset.group); }
          store.set('three.twCollapsed', [...collapsed]);
        });
        if (knobs.length) {
          const grid = el('div', { class: 'tw-knobs' });
          for (const [it, i] of knobs) { const r = knobRow(it, i); grid.append(r.el); }
          det.append(grid, ...knobs.map(([, i]) => rows.find((r) => r.i === i && r.knob)?.panelEl).filter(Boolean));
        }
        for (const [it, i] of others) det.append(row(it, i));
        det.paintChanged = () => { const n = changed(); badgeEl.textContent = n ? `${n} changed` : ''; };
        det.paintChanged();
        return det;
      };
      if (named.length) {
        // Named controls first, grouped as the sketch declares them; the raw numbers are tucked away.
        const groups = new Map();
        const favList = named.filter(([, i]) => favs.has(ids[i]));
        if (favList.length) groups.set('★ Favorites', favList);
        for (const pair of named) { const g = pair[0].group || 'Controls'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(pair); }
        groupSel.replaceChildren(el('option', { value: '', text: `All groups (${groups.size})` }), ...[...groups.keys()].map((g) => el('option', { value: g, text: g, selected: g === groupFilter })));
        groupSel.hidden = groups.size < 2;
        if (groupFilter && !groups.has(groupFilter)) groupFilter = '';
        paintChips([...groups.keys()]);
        for (const [g, list] of groups) body.append(groupSection(g, list));
        const adv = el('details', { class: 'tw-adv', open: store.get('three.tweaksAdvanced', false) },
          el('summary', { text: `All values in the code (${colors.length + numbers.length})` }),
          ...(colors.length ? section('Colors', colors) : []), ...(numbers.length ? section('Numbers', numbers) : []));
        adv.addEventListener('toggle', () => store.set('three.tweaksAdvanced', adv.open));
        if (colors.length + numbers.length) body.append(adv);
      } else {
        groupSel.hidden = true;
        paintChips([]);
        if (askForSliders) {
          body.append(el('div', { class: 'tw-tip' }, el('span', { text: 'Raw values from the code.' }),
            el('button', { class: 'ghost small', text: 'Ask for named sliders', title: 'The Three Director turns them into a short list of clearly named sliders', on: { click: askForSliders } })));
        }
        if (colors.length) body.append(...section('Colors', colors));
        if (numbers.length) body.append(...section('Numbers', numbers));
      }
      updateBadges();
      paintSlots();
      syncMotion();
      refreshState();
    }
    // The group chips above the list: All · ★ · each group. Click one to see only it; again for all.
    function paintChips(groups) {
      chips.hidden = groups.length < 2;
      const changedN = scanned ? scanned.items.filter((it, i) => it.key != null && !same(it, values[i])).length : 0;
      chips.replaceChildren(...['', ...groups].map((g) => {
        const idxOf = () => scanned.items.map((it, i) => i).filter((i) => scanned.items[i].key != null && (!g || (scanned.items[i].group || 'Controls') === g));
        const b = el('button', { class: `tw-gchip${g === groupFilter ? ' on' : ''}`, text: g || 'All', title: g ? `Only "${g}" (again: every group) · Shift+click: shuffle it · double-click: back to the code · right-click: its menu` : 'Every group · Shift+click: shuffle everything', on: { click: (e) => { if (e.shiftKey) { shuffle({ only: idxOf().filter((i) => !locks.has(ids[i])) }); return; } setGroupFilter(g === groupFilter ? '' : g); } } });
        b.addEventListener('dblclick', () => { if (g) resetGroup(idxOf()); });
        b.dataset.feature = g ? `Group chip: ${g}` : 'Group chip: All';
        if (g) b.addEventListener('contextmenu', (e) => { const sec = [...body.querySelectorAll('.tw-sec')].find((x) => x.dataset.group === g); const idxs = rows.filter((r) => sec?.contains(r.el)).map((r) => r.i); groupMenu(e, g, [...new Set(idxs)]); });
        return b;
      }), el('button', { class: `tw-gchip tw-gchip-changed${changedOnly ? ' on' : ''}`, text: `• Changed${changedN ? ` ${changedN}` : ''}`, title: 'Only the controls you moved (again: all)', dataset: { feature: 'Group chip: Changed' }, on: { click: () => { changedOnly = !changedOnly; changedBox.checked = changedOnly; applyFilter(); paintChips(groups); } } }));
      chips.dataset.groups = JSON.stringify(groups);
    }
    function setGroupFilter(g) {
      groupFilter = g || '';
      groupSel.value = groupFilter;
      chips.querySelectorAll('.tw-gchip').forEach((b) => b.classList.toggle('on', (b.textContent === 'All' ? '' : b.textContent) === groupFilter));
      applyFilter();
      if (groupFilter) body.querySelector(`.tw-sec[data-group="${CSS.escape(groupFilter)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    function updateBadges() {
      for (const r of rows) {
        const used = !reads || reads.used.has(r.i) || reads.live.has(r.i);
        const live = reads?.live.has(r.i);
        r.badge.textContent = !reads ? '' : live ? '⚡' : used ? '↻' : '○';
        r.badge.className = `tw-badge ${!reads ? '' : live ? 'tw-live' : used ? 'tw-rerun' : 'tw-unused'}`;
        r.badge.title = !reads ? '' : live ? 'Read every frame: changes show instantly' : used ? 'Used when the scene is built: the scene rebuilds as you drag' : 'The running sketch never reads this value';
        r.el.classList.toggle('unused', !used);
        r.paintMusic?.();
      }
      applyFilter();
    }
    function applyFilter() {
      for (const r of rows) {
        r.el.hidden = (filter && !r.text.includes(filter)) || (r.el.classList.contains('unused') && !showUnused) || (changedOnly && same(r.it, values[r.i]));
      }
      for (const sec of body.querySelectorAll('.tw-sec')) {
        sec.hidden = (groupFilter && sec.dataset.group !== groupFilter) || ![...sec.querySelectorAll('.tw-row, .tw-knob-cell')].some((n) => !n.hidden);
        if ((filter || changedOnly || groupFilter) && !sec.hidden) sec.open = true;
        sec.paintChanged?.();
      }
      const adv = body.querySelector('.tw-adv');
      if (adv && filter && rows.some((r) => !r.el.hidden && adv.contains(r.el))) adv.open = true;
      const shown = rows.filter((r) => !r.el.hidden && !r.el.closest('.tw-sec[hidden]')).length;
      matchCount.textContent = filter ? `${shown} of ${rows.length}` : '';
    }

    // Set named controls by key (numbers, colors, on / off, choices): one undo step.
    function setManyKeys(byKey) {
      if (!scanned) return [];
      const next = values.slice(); const done = [];
      scanned.items.forEach((it, i) => {
        if (it.key == null || !(it.key in byKey) || locks.has(ids[i])) return;
        let x = byKey[it.key];
        if (it.kind === 'number') x = Number(x);
        else if (it.kind === 'bool') x = x === true || x === 'true' || x === 1 || x === 'on';
        else x = String(x);
        if (it.kind === 'number' && !Number.isFinite(x)) return;
        if (it.kind === 'color' && !CSS_HEX.test(x)) return;
        next[i] = it.kind === 'color' ? normHex(x) : x; done.push(it.key);
      });
      applyValues(next);
      return done;
    }
    const codeWithValues = () => applyValues_(scanned.code, scanned.items, values);
    function save() {
      if (!dirtyCount()) return;
      const next = codeWithValues();
      const fresh = scan(next);
      const sameShape = fresh.items.length === scanned.items.length;
      scanned = fresh;
      ids = idsFor(fresh.items);
      values = fresh.items.map((it) => it.orig);
      committed = values.slice();
      undoStack = [];
      if (!sameShape) { shufHist = []; shufPos = -1; }
      commit(next);
      if (sameShape) render(); else { reads = null; rerun({ hot: true }); }
      toast('Saved into the sketch');
    }

    function prepare(code, base = 0) {
      instrumented = false;
      if (root.hidden) return null;
      if (!scanned || scanned.code !== code) {
        // Carry unsaved slider values over to the new code where the same control still exists.
        const carry = scanned ? Object.fromEntries(scanned.items.flatMap((it, i) => (same(it, values[i]) ? [] : [[ids[i], values[i]]]))) : {};
        try { scanned = scan(code); } catch (err) { console.warn('three-tweaks scan failed', err); scanned = { code, items: [] }; }
        ids = idsFor(scanned.items);
        values = scanned.items.map((it, i) => (ids[i] in carry && typeof carry[ids[i]] === typeof it.orig ? carry[ids[i]] : it.orig));
        committed = values.slice();
        undoStack = [];
        reads = null;
        if (shufHist[0]?.values.length !== values.length) { shufHist = []; shufPos = -1; }
        for (const k of Object.keys(motionSent)) delete motionSent[k];
        for (const k of Object.keys(walkState)) delete walkState[k];
        render();
      }
      notice.hidden = broken !== code;
      notice.textContent = 'Sliders are off for this version: the code has a syntax error (or doesn\'t run with sliders attached).';
      if (broken === code || !scanned.items.length) return null;
      instrumented = true;
      const keys = {};
      scanned.items.forEach((it, i) => { if (it.key != null) keys[`${it.call}.${it.key}`] = i; });
      return { code: instrument(code, scanned.items, base), values: scanned.items.map((it, i) => runtime(it, values[i])), keys, mods: modsNow() };
    }

    return {
      el: root,
      save: () => save(), saveLook: () => saveLook(),
      prepare,
      // The sandbox reports which values were read during setup and which keep being read.
      onReads(msg) {
        if (!instrumented) return;
        reads = { used: new Set(msg.used), live: new Set(msg.live) };
        updateBadges();
      },
      // Returns true when the error came from attaching sliders, and the sketch is re-run without them.
      onError(msg) {
        if (!instrumented || !/SyntaxError/.test(msg.message || '') || broken === scanned?.code) return false;
        broken = scanned.code;
        rerun({ hot: false });
        return true;
      },
      // Per-sketch looks and music links, loaded when a sketch opens.
      load(data = {}) {
        looks = Array.isArray(data.looks) ? data.looks : [];
        bindings = data.bindings && typeof data.bindings === 'object' ? data.bindings : {};
        locks = new Set(Array.isArray(data.locks) ? data.locks : []);
        favs = new Set(Array.isArray(data.favs) ? data.favs : []);
        slots = data.slots && typeof data.slots === 'object' ? data.slots : {};
        motions = data.motions && typeof data.motions === 'object' ? data.motions : {};
        shufHist = []; shufPos = -1;
        renderLooks();
        paintSlots();
        syncMotion();
        if (scanned) render();
      },
      // Unsaved values, so a sketch switch can offer to keep them and the director can see them.
      pending() { return scanned && dirtyCount() ? { from: scanned.code, to: codeWithValues() } : null; },
      unsaved() {
        if (!scanned) return [];
        return scanned.items.flatMap((it, i) => (same(it, values[i]) ? [] : [{ name: labelOf(it) || it.lineText, line: it.line, inCode: it.raw, slider: values[i] }]));
      },
      // What the director sees: the named controls with their current values, ranges and music links.
      controls() {
        if (!scanned) return [];
        return scanned.items.flatMap((it, i) => (it.key == null ? [] : [{
          key: it.key, label: labelOf(it), group: it.group, value: values[i], ...(it.kind === 'number' ? { min: it.range.min, max: it.range.max, ...(it.int ? { step: 1 } : {}) } : {}),
          ...(it.options ? { options: it.options } : {}), ...(bindings[ids[i]] ? { followsMusic: bindings[ids[i]] } : {}),
          live: reads ? reads.live.has(i) : undefined,
        }]));
      },
      forget() { scanned = null; ids = []; values = []; reads = null; undoStack = []; render(); refreshState(); },
      // Where a named control sits in the sandbox (for keyframes): { index, call, kind } or null.
      keyInfo(key) { const i = scanned?.items.findIndex((it) => it.key === key) ?? -1; return i < 0 ? null : { index: i, call: scanned.items[i].call, kind: scanned.items[i].kind, num: scanned.items[i].kind === 'color' && !scanned.items[i].quote, value: values[i], label: labelOf(scanned.items[i]) }; },
      // While the song plays: animated controls show their current value; ◆ shows when you're on a keyframe.
      sync(valuesByKey) {
        for (const r of rows) {
          if (r.it.key == null) continue;
          if (r.it.key in valuesByKey && !r.el.contains(document.activeElement)) { r.current = valuesByKey[r.it.key]; r.set(r.current); }
          r.paintKey?.();
        }
      },
      // MIDI / palette: set a named control as if its slider moved.
      setByKey(key, v, { release = false } = {}) {
        const i = scanned?.items.findIndex((it) => it.key === key) ?? -1;
        if (i < 0) return false;
        setValue(i, v, { release, external: true });
        rows.filter((r) => r.i === i).forEach((r) => r.set(v));
        return true;
      },
      // For the director: set several named controls at once (one undo step, unsaved like your own moves) and looks.
      setMany: (byKey) => setManyKeys(byKey),
      // ---------- for chat commands (tools/three-cmds.js) and MIDI ----------
      shuffle: (o) => shuffle(o || {}), shuffleStep: (d) => shuffleStep(d),
      get shuffleInfo() { return { amount: shufOpt.amount, scope: shufOpt.scope, history: shufHist.length - 1, at: shufPos, seed: shufHist[shufPos]?.seed ?? null }; },
      setShuffle(patch) { shufOpt = { ...shufOpt, ...patch }; store.set('three.shuffle', shufOpt); return shufOpt; },
      slotSave: (n) => slotSave(n), slotRecall: (n) => slotRecall(n), slotClear: (n) => slotClear(n),
      get slots() { return SLOTS.filter((n) => slots[n]); },
      morph(t, pair) { if (pair) { morphPair = pair; store.set('three.twMorphPair', pair); paintSlots(); } return morphTo(t, { release: true }); },
      copyValues: () => copyValues(), pasteValues: (text) => pasteValues(text), quickLook: () => quickLook(),
      lookStep: (d) => lookStep(d), swapSlots: () => swapSlots(), autoMorph: (bars) => setAutoMorph(bars), tame: (k) => tame(k), paletteColors: () => paletteColors(), tweakCode: () => tweakCode(),
      saveOne: (key) => { const i = scanned?.items.findIndex((x) => x.key === key) ?? -1; return i >= 0 && saveOne(i); }, morphLook: (name, ms) => { const l = looks.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); if (!l) return null; morphLook(l, ms); return l.name; },
      reset: () => reset(), undo: () => undo(), dirty: () => dirtyCount(),
      groups: () => [...new Set((scanned?.items || []).filter((it) => it.key != null).map((it) => it.group || 'Controls'))],
      showGroup: (g) => setGroupFilter(g), find: (q) => { search.value = q || ''; filter = search.value.toLowerCase().trim(); applyFilter(); return rows.filter((r) => !r.el.hidden).length; },
      focusSearch() { search.focus(); search.select(); },
      // a control by key or (part of) its label
      // by key or label; typed words also match across the "·" in labels ("bloom strength" → "Bloom · Strength")
      resolve(q) {
        const s0 = String(q || '').toLowerCase(); const words = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const w0 = words(s0);
        const named = (scanned?.items || []).filter((x) => x.key != null);
        const it = named.find((x) => x.key.toLowerCase() === s0 || labelOf(x).toLowerCase() === s0) || named.find((x) => labelOf(x).toLowerCase().includes(s0))
          || (w0 && (named.find((x) => words(labelOf(x)) === w0) || named.find((x) => words(labelOf(x)).includes(w0)) || named.find((x) => w0.split(' ').every((w) => words(`${labelOf(x)} ${x.key}`).includes(w)))));
        return it ? { key: it.key, label: labelOf(it), kind: it.kind } : null;
      },
      lock(key, on = true) { const i = scanned?.items.findIndex((x) => x.key === key) ?? -1; if (i < 0) return false; if (locks.has(ids[i]) !== on) toggleLock(i); return true; },
      fav(key, on = true) { const i = scanned?.items.findIndex((x) => x.key === key) ?? -1; if (i < 0) return false; if (favs.has(ids[i]) !== on) toggleFav(i); return true; },
      setMotion(key, mo) { const i = scanned?.items.findIndex((x) => x.key === key) ?? -1; if (i < 0 || scanned.items[i].kind !== 'number') return false; setMotion(i, mo); return true; },
      bind(key, band, amount = 0.5) { const i = scanned?.items.findIndex((x) => x.key === key) ?? -1; if (i < 0 || scanned.items[i].kind !== 'number') return false; setBinding(i, band || null, amount); return true; },
      // MIDI-ready: a 0..1 position (a knob, a fader, an OSC value…) → the control's range, like moving it by hand
      setNormalized(key, u, { release = false } = {}) {
        const i = scanned?.items.findIndex((x) => x.key === key) ?? -1;
        if (i < 0) return false;
        const it = scanned.items[i]; u = Math.max(0, Math.min(1, Number(u) || 0));
        let v;
        if (it.options) v = it.options[Math.min(it.options.length - 1, Math.floor(u * it.options.length))];
        else if (it.kind === 'bool') v = u >= 0.5;
        else if (it.kind === 'number') { v = it.range.min + u * (it.range.max - it.range.min); v = it.int ? Math.round(v) : Number(v.toPrecision(6)); } else return false;
        setValue(i, v, { release, external: true });
        rows.filter((r) => r.i === i).forEach((r) => r.set(v));
        return v;
      },
      playLook, endLook,
      get playingLook() { return played?.name || null; },
      looksApi: {
        list: () => looks.map((l) => l.name),
        save: (name) => { saveLookAs(String(name).slice(0, 40)); return looks.map((l) => l.name); },
        apply: (name) => { const l = looks.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); if (!l) throw new Error(`No look "${name}". Looks: ${looks.map((x) => x.name).join(', ') || 'none'}`); applyLook(l); return l.name; },
        remove: (name) => { looks = looks.filter((l) => l.name.toLowerCase() !== String(name).toLowerCase()); persist?.('looks', looks); renderLooks(); return looks.map((l) => l.name); },
      },
      setVisible(on) { root.hidden = !on; syncMotion(); },
      // the sketch closed or the layer went away: stop sending motion values
      destroy() { clearInterval(motionTimer); motionTimer = 0; autoMorph = 0; cancelAnimationFrame(played?.raf); },
      get visible() { return !root.hidden; },
    };
  }

  // Rotate a '#rrggbb' color's hue by `turn` (−1..1 of a full circle).
  function shiftHue(hex, turn) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) / 255; let g = ((n >> 8) & 255) / 255; let b = (n & 255) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    let h = 0; const l = (max + min) / 2; const d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h / 6 + turn) % 1 + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h * 6) % 2) - 1)); const m = l - c / 2;
    [r, g, b] = h < 1 / 6 ? [c, x, 0] : h < 2 / 6 ? [x, c, 0] : h < 3 / 6 ? [0, c, x] : h < 4 / 6 ? [0, x, c] : h < 5 / 6 ? [x, 0, c] : [c, 0, x];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }

  return { scan, instrument, applyValues, controller, menu, MOTIONS, RATES };
})();
