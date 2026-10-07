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
  const BANDS = [['kick', 'Kick'], ['snare', 'Snare'], ['hit', 'Hit'], ['beat', 'Beat'], ['bass', 'Bass'], ['mid', 'Mids'], ['treble', 'Highs'], ['level', 'Loudness']];
  const BAND_NAME = Object.fromEntries(BANDS);
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
  function controller({ send, rerun, goToLine, commit, askForSliders, quickAsk, persist, keyframes, touched }) {
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
    const saveBtn = btn('Save', 'Keep these values: write them into the sketch code (the old code stays in History)', () => save(), 'primary small');
    const resetBtn = btn('Reset', 'Back to the values in the code', () => reset());
    const undoBtn = btn('↶', 'Undo the last slider change', () => undo());
    const shuffleBtn = btn('🎲', 'Shuffle: nudge every control to a random nearby value (↶ to undo)', () => shuffle());
    const unusedBox = el('input', { type: 'checkbox' });
    unusedBox.addEventListener('change', () => { showUnused = unusedBox.checked; applyFilter(); });
    const search = el('input', { type: 'search', class: 'tw-search', placeholder: 'Find a slider…' });
    search.addEventListener('input', () => { filter = search.value.toLowerCase(); applyFilter(); });
    // Show one group at a time, knobs or sliders, only what you changed, and hold A/B to hear… see the code's values.
    const groupSel = el('select', { class: 'tw-groupsel', title: 'Show one group' });
    groupSel.addEventListener('change', () => { groupFilter = groupSel.value; applyFilter(); });
    const layoutSel = el('select', { class: 'tw-layoutsel', title: 'Knobs or sliders for numbers' },
      [['auto', 'Auto'], ['knobs', 'Knobs'], ['sliders', 'Sliders']].map(([v, l]) => el('option', { value: v, text: l, selected: v === layout })));
    layoutSel.addEventListener('change', () => { layout = layoutSel.value; store.set('three.twLayout', layout); render(); });
    const changedBox = el('input', { type: 'checkbox' });
    changedBox.addEventListener('change', () => { changedOnly = changedBox.checked; applyFilter(); });
    const abBtn = btn('A/B', 'Hold to see the values in the code (A); let go for yours (B)', () => {});
    abBtn.addEventListener('pointerdown', () => compare(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) abBtn.addEventListener(ev, () => compare(false));
    // Folds to one line so the controls get the room; remembers whether you keep it open.
    const asks = quickAsk ? el('details', { class: 'tw-asks', on: { toggle: (e) => store.set('three.twAsksOpen', e.currentTarget.open) } },
      el('summary', { class: 'tw-asks-title', text: 'Ask the director' }),
      ...['More energy', 'Calmer', 'New colors', 'Hit harder on beats', 'Simpler', 'More detail', 'Add a slider for…'].map((t) => el('button', {
        class: 'tw-chip', text: t, title: t.endsWith('…') ? 'Starts the message so you can finish it' : `Send "${t}" to the Three Director`,
        on: { click: () => quickAsk(t) },
      }))) : null;
    if (asks) asks.open = store.get('three.twAsksOpen', false);
    const root = el('div', { class: 'tweaks' },
      el('div', { class: 'tw-head' }, el('b', { text: 'Sliders' }), count, el('span', { class: 'spacer' }), undoBtn, shuffleBtn, resetBtn, saveBtn),
      status, looksBar,
      el('div', { class: 'tw-tools' }, search, abBtn),
      el('div', { class: 'tw-tools tw-tools2' }, groupSel, layoutSel, el('label', { class: 'check small', title: 'Only the controls you moved' }, changedBox, 'Changed'),
        el('label', { class: 'check small', title: 'Also list values the running sketch never reads' }, unusedBox, 'Unused')),
      notice, body, asks,
      el('div', { class: 'tw-foot', title: 'Knobs: drag up / down (Shift = fine), wheel or arrow keys to step. They click into the value in the code (the blue notch) as you pass it; double-click goes back to it. Right-click: lock, favorites, follow the music, keyframe.' },
        el('span', { html: '<b class="tw-live">⚡</b> instant · <b class="tw-rerun">↻</b> rebuilds · <b class="tw-music">♪</b> music · <b style="color:#48ddff">|</b> code value · right-click: 🔒 ★' })));

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
      undoBtn.disabled = !undoStack.length;
      shuffleBtn.disabled = !scanned?.items.some((it) => it.key != null);
      saveBtn.textContent = d ? `Save ${d}` : 'Save';
      root.classList.toggle('dirty', d > 0);
      status.className = `tw-status${d ? ' dirty' : ''}`;
      status.textContent = !scanned?.items.length ? '' : d
        ? `You're seeing ${d} change${d > 1 ? 's' : ''} live. Save keeps ${d > 1 ? 'them' : 'it'} in the sketch.`
        : 'Changes show live as you move a slider. Nothing to save.';
      rows.forEach((r) => r.el.classList.toggle('changed', !same(r.it, values[r.i])));
      body.querySelectorAll('.tw-sec').forEach((sec) => sec.paintChanged?.());
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
      if (release) checkpoint();
    }
    // Undo works on whole gestures: a checkpoint after each release, shuffle, look or reset.
    function checkpoint() {
      if (!scanned || committed.length !== values.length || committed.every((v, i) => v === values[i])) { committed = values.slice(); return; }
      undoStack.push(committed);
      if (undoStack.length > 60) undoStack.shift();
      committed = values.slice();
      refreshState();
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
      if (remember) checkpoint(); else committed = values.slice();
      refreshState();
    }
    function undo() {
      const prev = undoStack.pop();
      if (!prev || prev.length !== values.length) return;
      applyValues(prev, { remember: false });
    }
    function shuffle() { if (scanned) applyValues(shuffled(null)); }
    // Random nearby values for every control (or only the indexes in `only`).
    function shuffled(only) {
      const next = values.slice();
      const rnd = (a, b) => a + Math.random() * (b - a);
      scanned.items.forEach((it, i) => {
        if (it.key == null || locks.has(ids[i])) return;
        if (it.kind === 'number') {
          const { min, max, step } = it.range;
          const span = max - min;
          let x = Math.min(max, Math.max(min, values[i] + rnd(-0.35, 0.35) * span));
          x = it.int ? Math.round(x) : Number((Math.round(x / step) * step).toFixed(6));
          next[i] = x;
        } else if (it.kind === 'color') next[i] = shiftHue(values[i], rnd(-0.5, 0.5));
        else if (it.kind === 'bool') next[i] = Math.random() < 0.25 ? !values[i] : values[i];
        else if (it.kind === 'choice' && it.options?.length) next[i] = Math.random() < 0.4 ? it.options[Math.floor(Math.random() * it.options.length)] : values[i];
      });
      return only ? values.map((v, i) => (only.includes(i) ? next[i] : v)) : next;
    }
    function reset() {
      if (!scanned) return;
      applyValues(scanned.items.map((it) => it.orig));
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
    function rowMenu(e, it, i, r) {
      e.preventDefault();
      const locked = locks.has(ids[i]);
      showMenu(e.clientX, e.clientY, [
        { label: `↺ Back to the code's value (${it.kind === 'number' ? trimNum(it.orig) : it.orig})`, action: () => resetOne(i) },
        { label: locked ? '🔓 Unlock' : '🔒 Lock at this value', action: () => toggleLock(i) },
        { label: '🔒 Reset and lock', action: () => { if (locks.has(ids[i])) toggleLock(i); resetOne(i); toggleLock(i); } },
        { label: favs.has(ids[i]) ? '☆ Remove from Favorites' : '★ Add to Favorites', action: () => toggleFav(i) },
        ...(r.musicPanel ? [{ label: '♪ Follow the music…', action: () => { r.musicPanel.hidden = false; r.paintMusic?.(); } }] : []),
        ...(keyframes && it.key != null && (it.kind === 'number' || it.kind === 'color') ? [{ label: '◆ Keyframe at the playhead', action: () => { keyframes.toggle(it.key, values[i]); r.paintKey?.(); } }] : []),
        { label: `Show line ${it.line} in the code`, action: () => goToLine(it.line) },
      ]);
    }

    // ---------- looks: named sets of values you can click between ----------
    function renderLooks() {
      looksBar.replaceChildren();
      if (!scanned?.items.length) return;
      for (const look of looks) {
        const chip = el('span', { class: 'tw-look' },
          el('button', { class: 'tw-look-apply', text: look.name, title: `Switch to "${look.name}" (↶ to undo)`, on: { click: () => applyLook(look) } }),
          el('button', { class: 'tw-look-x', text: '×', title: `Delete "${look.name}"`, on: { click: () => { looks = looks.filter((l) => l !== look); persist?.('looks', looks); renderLooks(); } } }));
        looksBar.append(chip);
      }
      looksBar.append(el('button', { class: 'tw-chip add', text: '＋ Save look', title: 'Remember the current slider values as a look you can switch back to with one click', on: { click: saveLook } }));
    }
    async function saveLook() {
      const name = await Modal.prompt('Save look', { value: `Look ${looks.length + 1}`, placeholder: 'e.g. Calm intro, Drop, Neon' });
      if (!name?.trim()) return;
      const v = {};
      scanned.items.forEach((it, i) => { if (it.key != null || !same(it, values[i])) v[ids[i]] = values[i]; });
      looks = looks.filter((l) => l.name !== name.trim()).concat({ name: name.trim(), values: v });
      persist?.('looks', looks);
      renderLooks();
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
      panel.append(el('div', { class: 'tw-bind-bands' }, ...bandBtns), el('div', { class: 'tw-num-row' }, el('span', { class: 'tw-hint', text: 'Amount' }), amount, pct), note);
      paint();
      return { panel, paint };
    }

    // ---------- controls ----------
    function control(it, i) {
      const v = values[i];
      if (it.kind === 'bool') {
        const box = el('input', { type: 'checkbox', checked: Boolean(v) });
        box.addEventListener('change', () => setValue(i, box.checked, { release: true }));
        return { node: el('label', { class: 'tw-switch' }, box, el('span', { text: 'On' })), set: (x) => { box.checked = Boolean(x); } };
      }
      if (it.kind === 'choice') {
        const opts = it.options?.length ? [...new Set([...it.options, v])] : [v];
        const sel = el('select', { class: 'tw-select' }, opts.map((o) => el('option', { value: o, text: humanize(o), selected: o === v })));
        sel.addEventListener('change', () => setValue(i, sel.value, { release: true }));
        return { node: sel, set: (x) => { sel.value = x; } };
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
      num.addEventListener('change', () => { const x = Number(num.value); if (!Number.isFinite(x)) return; widen(x); slider.value = x; setValue(i, it.int ? Math.round(x) : x, { release: true }); });
      slider.addEventListener('dblclick', () => { widen(it.orig); slider.value = it.orig; num.value = it.int ? it.orig : trimNum(it.orig); setValue(i, it.orig, { release: true }); });
      const wrap = el('div', { class: 'tw-range' }, slider, tick);
      return { node: el('div', { class: 'tw-num-row' }, wrap, num), set: (x) => { widen(x); slider.value = x; num.value = it.int ? x : trimNum(x); wrap.classList.toggle('at-orig', x === it.orig); } };
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
          commit(quant(v0 + d * (hi - lo) * (ev.shiftKey ? 0.15 : 1), true), false);
        };
        const up = () => { svg.removeEventListener('pointermove', move); cell.classList.remove('turning'); held = false; commit(cur, true); };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerup', up, { once: true });
      });
      svg.addEventListener('dblclick', () => resetOne(i));
      svg.addEventListener('wheel', (e) => {
        if (locks.has(ids[i])) return;
        e.preventDefault();
        const stepBy = it.int ? 1 : (hi - lo) / (e.shiftKey ? 400 : 100);
        commit(quant(cur + (e.deltaY < 0 ? stepBy : -stepBy)), true);
      }, { passive: false });
      svg.addEventListener('keydown', (e) => {
        if (!/^Arrow(Up|Down|Left|Right)$/.test(e.key) || locks.has(ids[i])) return;
        e.preventDefault(); e.stopPropagation();
        const stepBy = it.int ? 1 : (hi - lo) / (e.shiftKey ? 400 : 100);
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
      const r = { it, i, badge, set: k.set, text: `${labelOf(it) || ''} ${it.hint || ''} ${it.lineText}`.toLowerCase(), knob: true };
      const name = el('span', { class: 'tw-kname', text: labelOf(it) || it.raw, title: [labelOf(it), it.hint, `line ${it.line}`].filter(Boolean).join('\n') });
      const icons = el('span', { class: 'tw-kicons' });
      const music = el('button', { class: 'tw-music-btn', text: '♪', title: 'Follow the music' });
      const { panel, paint } = musicPanel(it, i, r);
      panel.classList.add('tw-kpanel');
      music.addEventListener('click', () => { panel.hidden = !panel.hidden; paint(); });
      r.updateMusic = () => { const b = bindings[ids[i]]; music.textContent = b ? '♪' : '♪'; music.title = b ? `Follows ${BAND_NAME[b.band]}` : 'Follow the music'; music.classList.toggle('on', Boolean(b)); k.cell.classList.toggle('music', Boolean(b)); };
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
      const r = { it, i, badge, set: ctl.set, text: `${labelOf(it) || ''} ${it.hint || ''} ${it.lineText}`.toLowerCase() };
      if (it.kind === 'number') {
        const music = el('button', { class: 'tw-music-btn', text: '♪', title: 'Make this slider follow the music (bass, mids, highs, loudness or the beat)' });
        const { panel, paint } = musicPanel(it, i, r);
        music.addEventListener('click', () => { panel.hidden = !panel.hidden; paint(); });
        r.updateMusic = () => {
          const b = bindings[ids[i]];
          music.textContent = b ? `♪ ${BAND_NAME[b.band]}` : '♪';
          music.classList.toggle('on', Boolean(b));
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
        det.open = !collapsed.has(g);
        det.addEventListener('toggle', () => { if (det.open) collapsed.delete(g); else collapsed.add(g); store.set('three.twCollapsed', [...collapsed]); });
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
        for (const [g, list] of groups) body.append(groupSection(g, list));
        const adv = el('details', { class: 'tw-adv', open: store.get('three.tweaksAdvanced', false) },
          el('summary', { text: `All values in the code (${colors.length + numbers.length})` }),
          ...(colors.length ? section('Colors', colors) : []), ...(numbers.length ? section('Numbers', numbers) : []));
        adv.addEventListener('toggle', () => store.set('three.tweaksAdvanced', adv.open));
        if (colors.length + numbers.length) body.append(adv);
      } else {
        groupSel.hidden = true;
        if (askForSliders) {
          body.append(el('div', { class: 'tw-tip' }, el('span', { text: 'These are all the raw values in the code. Want a short list of clearly named sliders instead?' }),
            el('button', { class: 'ghost small', text: 'Ask the Three Director', on: { click: askForSliders } })));
        }
        if (colors.length) body.append(...section('Colors', colors));
        if (numbers.length) body.append(...section('Numbers', numbers));
      }
      updateBadges();
      refreshState();
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
        renderLooks();
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
      setVisible(on) { root.hidden = !on; },
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

  return { scan, instrument, applyValues, controller };
})();
