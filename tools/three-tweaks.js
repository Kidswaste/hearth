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
  function instrument(code, items) {
    let out = '';
    let p = 0;
    items.forEach((it, i) => { out += code.slice(p, it.start) + (/[\w$]/.test(code[it.start - 1] || '') ? ' ' : '') + `__tv(${i})`; p = it.end; });
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
  function controller({ send, rerun, goToLine, commit, askForSliders, quickAsk, persist }) {
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
    const asks = quickAsk ? el('div', { class: 'tw-asks' }, el('span', { class: 'tw-asks-title', text: 'Ask the director' }),
      ['More energy', 'Calmer', 'New colors', 'Hit harder on beats', 'Simpler', 'More detail', 'Add a slider for…'].map((t) => el('button', {
        class: 'tw-chip', text: t, title: t.endsWith('…') ? 'Starts the message so you can finish it' : `Send "${t}" to the Three Director`,
        on: { click: () => quickAsk(t) },
      }))) : null;
    const root = el('div', { class: 'tweaks' },
      el('div', { class: 'tw-head' }, el('b', { text: 'Sliders' }), count, el('span', { class: 'spacer' }), undoBtn, shuffleBtn, resetBtn, saveBtn),
      status, looksBar,
      el('div', { class: 'tw-tools' }, search, el('label', { class: 'check small', title: 'Also list values the running sketch never reads' }, unusedBox, 'Unused')),
      notice, body, asks,
      el('div', { class: 'tw-foot' }, el('span', { html: '<b class="tw-live">⚡</b> instant · <b class="tw-rerun">↻</b> rebuilds the scene as you drag · <b class="tw-music">♪</b> follows the music' })));

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
    }
    function setValue(i, v, { release = false } = {}) {
      const it = scanned.items[i];
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
        if (v === values[i] || v === undefined) return;
        values[i] = v;
        const it = scanned.items[i];
        send({ type: 'tweak', index: i, value: runtime(it, v), call: it.call, key: it.key });
        rows.find((r) => r.i === i)?.set(v);
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
    function shuffle() {
      if (!scanned) return;
      const next = values.slice();
      const rnd = (a, b) => a + Math.random() * (b - a);
      scanned.items.forEach((it, i) => {
        if (it.key == null) return;
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
      applyValues(next);
    }
    function reset() {
      if (!scanned) return;
      applyValues(scanned.items.map((it) => it.orig));
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
      const slider = el('input', { type: 'range', min: r.min, max: r.max, step: r.step, value: v, title: 'Double-click to go back to the value in the code' });
      const num = el('input', { type: 'number', class: 'tw-num', step: r.step, value: it.int ? v : trimNum(v) });
      const widen = (x) => { if (x < Number(slider.min)) slider.min = x; if (x > Number(slider.max)) slider.max = x; };
      slider.addEventListener('input', () => { const x = Number(slider.value); num.value = it.int ? x : trimNum(x); setValue(i, x); });
      slider.addEventListener('change', () => setValue(i, Number(slider.value), { release: true }));
      num.addEventListener('change', () => { const x = Number(num.value); if (!Number.isFinite(x)) return; widen(x); slider.value = x; setValue(i, it.int ? Math.round(x) : x, { release: true }); });
      slider.addEventListener('dblclick', () => { widen(it.orig); slider.value = it.orig; num.value = it.int ? it.orig : trimNum(it.orig); setValue(i, it.orig, { release: true }); });
      return { node: el('div', { class: 'tw-num-row' }, slider, num), set: (x) => { widen(x); slider.value = x; num.value = it.int ? x : trimNum(x); } };
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
      top.append(badge, el('button', { class: 'tw-line', text: `L${it.line}`, title: `Show line ${it.line} in the code`, on: { click: () => goToLine(it.line) } }));
      r.el = el('div', { class: `tw-row kind-${it.kind}${named ? ' named' : ''}` }, top, it.hint ? el('div', { class: 'tw-hint', text: it.hint }) : null, ctl.node, r.musicPanel || null);
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
      if (named.length) {
        // Named controls first, grouped as the sketch declares them; the raw numbers are tucked away.
        const groups = new Map();
        for (const pair of named) { const g = pair[0].group || 'Controls'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(pair); }
        for (const [g, list] of groups) body.append(...section(g, list));
        const adv = el('details', { class: 'tw-adv', open: store.get('three.tweaksAdvanced', false) },
          el('summary', { text: `All values in the code (${colors.length + numbers.length})` }),
          ...(colors.length ? section('Colors', colors) : []), ...(numbers.length ? section('Numbers', numbers) : []));
        adv.addEventListener('toggle', () => store.set('three.tweaksAdvanced', adv.open));
        if (colors.length + numbers.length) body.append(adv);
      } else {
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
      for (const r of rows) r.el.hidden = (filter && !r.text.includes(filter)) || (r.el.classList.contains('unused') && !showUnused);
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

    function prepare(code) {
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
      return { code: instrument(code, scanned.items), values: scanned.items.map((it, i) => runtime(it, values[i])), keys, mods: modsNow() };
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
      load(data = {}) { looks = Array.isArray(data.looks) ? data.looks : []; bindings = data.bindings && typeof data.bindings === 'object' ? data.bindings : {}; renderLooks(); },
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
          key: it.key, label: labelOf(it), group: it.group, value: values[i], ...(it.kind === 'number' ? { min: it.range.min, max: it.range.max } : {}),
          ...(it.options ? { options: it.options } : {}), ...(bindings[ids[i]] ? { followsMusic: bindings[ids[i]] } : {}),
          live: reads ? reads.live.has(i) : undefined,
        }]));
      },
      forget() { scanned = null; ids = []; values = []; reads = null; undoStack = []; render(); refreshState(); },
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
