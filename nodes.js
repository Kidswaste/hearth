// Nodes: a generic visual node-graph editor (nodes + connecting dots instead of raw code) and a small graph
// compiler. Adapters (tools/three-nodes.js for the Three.js Lab; later Video Director and chat code) define
// node types in a registry and turn graphs into code.
//
//   const reg = NodeView.createRegistry({ name: 'three', types: { num: { color: '#48ddff', label: 'Number' } },
//     compat: { num: ['trig'] }, convert: (from, to, expr) => expr, assemble: (parts, graph) => code });
//   reg.define({ type: 'add', title: 'Add', category: 'Math', color: '#48ddff', desc: 'a + b',
//     inputs: [{ name: 'a', type: 'num', value: 0 }, { name: 'b', type: 'num', value: 1, min: 0, max: 10 }],
//     outputs: [{ name: 'out', type: 'num' }],
//     widgets: [{ name: 'mode', kind: 'select', options: ['x', 'y'], value: 'x', slider: false }],
//     compile: (c) => ({ out: `(${c.in('a')} + ${c.in('b')})` }) });
//   const view = NodeView.create(container, { registry: reg, graph, onChange: (graph, info) => {} });
//   const { code, errors } = reg.compile(view.getGraph());
//
// Graph JSON: { v: 1, kind, nodes: [{ id, type, x, y, title?, values?, sliders?, collapsed?, color? }],
//   links: [{ from: [nodeId, output], to: [nodeId, input] }], frames: [{ id, x, y, w, h, title, color }],
//   notes: [{ id, x, y, w, text }] }. Code made from a graph carries it in its last line (embed / extract),
// so it round-trips: NodeView.openCode(code, lang) reopens it in the right adapter.
const NodeView = (() => {
  const GRID = 16;
  const COLORS = ['#ffd75e', '#48ddff', '#bd8bff', '#ff6b9d', '#ff8c42', '#7cd992', '#ff6a6a', '#7ad0ff', '#c9b79c'];
  const BASE_TYPES = { any: { color: '#9a9187', label: 'Anything' } };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v) => {
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (!isNum(v)) return String(v ?? '');
    const a = Math.abs(v);
    return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3).replace(/0$/, '');
  };
  const slug = (s) => String(s || 'node').replace(/[^a-z0-9]+(.)?/gi, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-z]+/i, '').replace(/^./, (c) => c.toLowerCase()) || 'node';

  // ---------- registry ----------
  // A field is an input (a socket, with an inline widget while it's not connected) or a widget (no socket).
  function normField(f, socket) {
    const type = f.type || (f.kind === 'color' ? 'color' : f.kind === 'toggle' ? 'bool' : f.kind === 'vec' ? 'vec3' : socket ? 'any' : 'num');
    let kind = f.kind;
    if (kind === undefined) {
      if (f.options) kind = 'select';
      else if (type === 'num' || type === 'trig') kind = 'number';
      else if (type === 'color') kind = 'color';
      else if (type === 'bool') kind = 'toggle';
      else if (type === 'vec3') kind = 'vec';
      else if (type === 'text') kind = 'text';
      else kind = null;
    }
    return { label: f.label || f.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), ...f, type, kind, socket };
  }
  // sliderLabel: the knob menu item that exposes a widget as a slider (null hides it); bypass: false turns M off.
  function createRegistry({ name = 'nodes', types = {}, compat = {}, convert, assemble, groupOf, paramExpr, idBase, staticTypes = [], sliderLabel = 'Show as a Lab slider', sliderHint = 'Exposed sliders can be shuffled, saved as looks and animated', bypass = true } = {}) {
    const defs = new Map();
    const reg = {
      name, staticTypes: new Set(staticTypes), sliderLabel, sliderHint, bypass,
      types: { ...BASE_TYPES, ...types },
      define(def) {
        if (!def?.type || typeof def.type !== 'string') throw new Error('Node definitions need a type');
        const d = {
          title: def.type, category: 'Other', desc: '', width: 0, ...def,
          inputs: (def.inputs || []).map((f) => normField(f, true)),
          outputs: (def.outputs || []).map((o) => ({ label: o.label || o.name.replace(/^./, (c) => c.toUpperCase()), ...o, type: o.type || 'any' })),
          widgets: (def.widgets || []).map((f) => normField(f, false)),
        };
        d.fields = [...d.inputs, ...d.widgets];
        defs.set(d.type, d);
        return d;
      },
      get: (type) => defs.get(type),
      has: (type) => defs.has(type),
      list: () => [...defs.values()].filter((d) => !d.hidden),
      categories: () => [...new Set(reg.list().map((d) => d.category))],
      typeColor: (t) => reg.types[t]?.color || BASE_TYPES.any.color,
      // Can an output of type `from` feed an input of type `to`?
      compatible: (from, to) => from === to || from === 'any' || to === 'any' || Boolean(compat[from]?.includes(to)),
      convert: (from, to, expr) => (convert && from !== to ? convert(from, to, expr) : expr),
      groupOf: groupOf || ((node, def) => def.category),
      paramExpr: paramExpr || ((key) => `P.${key}`),
      idFor(def, graph) {
        const base = slug(idBase ? idBase(def) : def.idBase || def.title || def.type);
        const used = new Set((graph?.nodes || []).map((n) => n.id));
        let i = 1;
        while (used.has(`${base}${i}`)) i += 1;
        return `${base}${i}`;
      },
      assemble: assemble || ((p) => [...p.top, ...p.setup, ...p.frame].join('\n')),
      compile: (graph, opts) => compileGraph(graph, reg, opts),
    };
    // Reroute dots: pass anything through, so long wires can be tidied.
    reg.define({ type: '@reroute', title: 'Reroute', category: 'Layout', hidden: true, inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }], compile: (c) => ({ out: c.in('in') }) });
    return reg;
  }

  // ---------- graph helpers ----------
  const emptyGraph = (kind = '') => ({ v: 1, kind, nodes: [], links: [], frames: [], notes: [] });
  function normalize(g, reg) {
    const graph = { ...emptyGraph(g?.kind || reg?.name || ''), ...(g || {}) };
    for (const k of ['nodes', 'links', 'frames', 'notes']) graph[k] = Array.isArray(graph[k]) ? graph[k] : [];
    const ids = new Set();
    graph.nodes = graph.nodes.filter((n) => n && n.type && (!reg || reg.has(n.type))).map((n) => {
      const def = reg?.get(n.type);
      const node = { ...n, x: Number(n.x) || 0, y: Number(n.y) || 0, values: { ...(n.values || {}) } };
      if (!node.id || ids.has(node.id)) node.id = reg ? reg.idFor(def, { nodes: [...ids].map((id) => ({ id })) }) : `n${ids.size + 1}`;
      ids.add(node.id);
      if (def) for (const f of def.fields) if (!(f.name in node.values) && f.value !== undefined) node.values[f.name] = clone(f.value);
      return node;
    });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    graph.links = graph.links.filter((l) => {
      const a = byId.get(l?.from?.[0]); const b = byId.get(l?.to?.[0]);
      if (!a || !b || a === b) return false;
      if (!reg) return true;
      return Boolean(reg.get(a.type)?.outputs.some((o) => o.name === l.from[1]) && reg.get(b.type)?.inputs.some((f) => f.name === l.to[1]));
    }).map((l) => ({ from: [l.from[0], l.from[1]], to: [l.to[0], l.to[1]] }));
    return graph;
  }
  // The smallest JSON that rebuilds the graph: values equal to their defaults are left out.
  function compact(graph, reg) {
    const r = (v) => Math.round(v);
    return {
      v: 1, kind: graph.kind,
      nodes: graph.nodes.map((n) => {
        const def = reg?.get(n.type);
        const values = {};
        for (const [k, v] of Object.entries(n.values || {})) {
          const f = def?.fields.find((x) => x.name === k);
          if (!f || JSON.stringify(f.value) !== JSON.stringify(v)) values[k] = v;
        }
        return { id: n.id, type: n.type, x: r(n.x), y: r(n.y), ...(Object.keys(values).length ? { values } : {}), ...(n.title ? { title: n.title } : {}), ...(n.sliders && Object.keys(n.sliders).length ? { sliders: n.sliders } : {}), ...(n.collapsed ? { collapsed: true } : {}), ...(n.color ? { color: n.color } : {}), ...(n.group ? { group: n.group } : {}), ...(n.bypass ? { bypass: true } : {}) };
      }),
      links: graph.links.map((l) => ({ from: l.from, to: l.to })),
      ...(graph.frames.length ? { frames: graph.frames.map((f) => ({ ...f, x: r(f.x), y: r(f.y), w: r(f.w), h: r(f.h) })) } : {}),
      ...(graph.notes.length ? { notes: graph.notes.map((m) => ({ ...m, x: r(m.x), y: r(m.y) })) } : {}),
      ...(graph.meta ? { meta: graph.meta } : {}),
    };
  }
  const EMBED = '// @nodes:v1 ';
  const EMBED_RE = /\n?[ \t]*\/\/ @nodes:v1 (\{.*\})[ \t]*\n?\s*$/;
  // Code + its graph in a trailing comment (one line of JSON) so it round-trips.
  const embed = (code, graph, reg) => `${String(code).replace(/\s+$/, '')}\n${EMBED}${JSON.stringify(compact(graph, reg))}\n`;
  function extract(code) {
    const m = String(code || '').match(EMBED_RE);
    if (!m) return null;
    try { return { graph: JSON.parse(m[1]), body: String(code).slice(0, m.index).replace(/\s+$/, '') }; } catch { return null; }
  }

  // ---------- compiler ----------
  // Walks the graph in dependency order and asks each node's `compile(ctx)` for code. Values that change over
  // time ("dynamic": music, time, sliders) are tracked so adapters can put their uses in the per-frame code.
  function compileGraph(input, reg, { probe = false } = {}) {
    const graph = normalize(input, reg);
    const parts = { imports: new Map(), top: [], helpers: new Map(), setup: [], frame: [], tweaks: [], shared: {}, probes: [], nodes: [] };
    const errors = []; const warnings = [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const into = new Map(); // "id.input" → [links]
    for (const l of graph.links) { const k = `${l.to[0]}.${l.to[1]}`; if (!into.has(k)) into.set(k, []); into.get(k).push(l); }
    // dependency order (cycles are reported and cut)
    const order = []; const state = new Map();
    const visit = (n) => {
      if (state.get(n.id) === 2) return;
      if (state.get(n.id) === 1) { errors.push({ node: n.id, message: 'This node is part of a loop of wires' }); return; }
      state.set(n.id, 1);
      for (const l of graph.links) if (l.to[0] === n.id && byId.get(l.from[0]) && state.get(l.from[0]) !== 1) visit(byId.get(l.from[0]));
      state.set(n.id, 2);
      order.push(n);
    };
    for (const n of [...graph.nodes].sort((a, b) => a.x - b.x || a.y - b.y)) visit(n);
    const outs = new Map(); // "id.port" → { expr, dyn, type }
    const dynamic = new Set();
    const used = new Set();
    const uniq = (base) => { let b = slug(base); let i = ''; while (used.has(b + i)) i = (i || 1) + 1; used.add(b + i); return b + i; };
    for (const n of graph.nodes) used.add(n.id);
    for (const node of order) {
      const def = reg.get(node.type);
      if (!def?.compile) continue;
      let anyDyn = false;
      const fieldOf = (name) => def.fields.find((f) => f.name === name);
      const sourceOf = (l) => outs.get(`${l.from[0]}.${l.from[1]}`);
      const linksOf = (name) => (into.get(`${node.id}.${name}`) || []).filter((l) => sourceOf(l));
      const exposed = (f) => f && ['number', 'knob', 'color', 'toggle', 'select'].includes(f.kind) && (node.sliders?.[f.name] ?? f.slider ?? def.sliders ?? true);
      const ctx = {
        id: node.id, node, def, graph, shared: parts.shared,
        value: (name) => node.values?.[name] ?? fieldOf(name)?.value,
        linked: (name) => linksOf(name).length > 0,
        lit: (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map((x) => ctx.lit(x)).join(', ')}]` : JSON.stringify(v ?? null)),
        // The expression for a widget: a Lab slider (live) or a plain value.
        param(name) {
          const f = fieldOf(name);
          const v = ctx.value(name);
          if (!exposed(f) || v === undefined || (f.kind === 'number' || f.kind === 'knob') && !isNum(v)) return f?.kind === 'vec' && Array.isArray(v) ? ctx.lit(v) : ctx.lit(v);
          const key = `${node.id}_${name}`;
          if (!parts.tweaks.some((t) => t.key === key)) {
            // fields can take their label, group and range from other fields (a "Slider" node the user names)
            const from = (k, d) => (f[`${k}From`] ? ctx.value(f[`${k}From`]) ?? d : d);
            const t = { key, value: v, label: from('label', '') || `${node.title || def.title} · ${f.label}`, group: from('group', '') || reg.groupOf(node, def, graph), node: node.id, field: name };
            if (f.kind === 'number' || f.kind === 'knob') {
              const min = Number(from('min', f.min ?? Math.min(0, v))); const max = Number(from('max', f.max ?? Math.max(1, v * 2 || 1)));
              Object.assign(t, { min: Math.min(min, v), max: Math.max(max, v), ...(f.step ? { step: f.step } : {}) });
            }
            if (f.kind === 'select') t.options = f.options.map((o) => (typeof o === 'object' ? o.value : o));
            if (f.hint) t.hint = f.hint;
            parts.tweaks.push(t);
          }
          anyDyn = true;
          return reg.paramExpr(key, node, f);
        },
        in(name) {
          const f = fieldOf(name);
          const ls = linksOf(name);
          if (ls.length) {
            const src = sourceOf(ls[0]);
            if (src.dyn) anyDyn = true;
            return reg.convert(src.type, f?.type || 'any', src.expr);
          }
          if (f?.kind) return ctx.param(name);
          return f?.fallback ?? 'undefined';
        },
        ins(name) { const f = fieldOf(name); return linksOf(name).map((l) => { const s = sourceOf(l); if (s.dyn) anyDyn = true; return reg.convert(s.type, f?.type || 'any', s.expr); }); },
        dyn(name) {
          const ls = linksOf(name);
          if (ls.length) return ls.some((l) => sourceOf(l).dyn);
          return exposed(fieldOf(name)) && ctx.value(name) !== undefined;
        },
        // The type of what's connected to an input (or the input's own type).
        typeIn: (name) => { const ls = linksOf(name); return ls.length ? sourceOf(ls[0]).type : fieldOf(name)?.type; },
        // A statement that sets something from an input: once at setup when it never changes, else every frame.
        apply(name, stmt) { const e = ctx.in(name); if (ctx.dyn(name)) ctx.frame(stmt(e)); else ctx.setup(stmt(e)); },
        setup: (code) => { if (code) node.__setup.push(code); },
        frame: (code) => { if (code) node.__frame.push(code); },
        top: (code) => { if (code && !parts.top.includes(code)) parts.top.push(code); },
        helper: (key, code) => { if (!parts.helpers.has(key)) parts.helpers.set(key, code); return key; },
        import: (names, from) => { const s = parts.imports.get(from) || new Set(); for (const x of [].concat(names)) s.add(x); parts.imports.set(from, s); },
        out(name, expr, dyn) { node.__outs[name] = { expr, dyn }; },
        uniq, warn: (message) => warnings.push({ node: node.id, message }), error: (message) => errors.push({ node: node.id, message }),
      };
      node.__setup = []; node.__frame = []; node.__outs = {};
      // a bypassed node (M) hands each output the first wired input that fits it, and adds no code of its own
      if (node.bypass && node.type !== '@reroute') {
        for (const o of def.outputs) {
          const f = def.inputs.find((x) => linksOf(x.name).length && reg.compatible(sourceOf(linksOf(x.name)[0]).type, o.type));
          if (!f) continue;
          const src = sourceOf(linksOf(f.name)[0]);
          outs.set(`${node.id}.${o.name}`, { expr: reg.convert(src.type, o.type, src.expr), dyn: src.dyn, type: o.type });
          if (src.dyn) dynamic.add(`${node.id}.${o.name}`);
        }
        delete node.__setup; delete node.__frame; delete node.__outs;
        continue;
      }
      let ret;
      try { ret = def.compile(ctx) || {}; } catch (err) { errors.push({ node: node.id, message: err.message }); ret = {}; }
      for (const [k, expr] of Object.entries(ret)) if (!(k in node.__outs)) node.__outs[k] = { expr };
      for (const o of def.outputs) {
        const r = node.__outs[o.name];
        if (!r) continue;
        let type = o.type;
        if (node.type === '@reroute') { const l = linksOf('in')[0]; type = l ? sourceOf(l).type : 'any'; }
        const dyn = reg.staticTypes.has(type) ? false : (r.dyn ?? (def.live || anyDyn));
        outs.set(`${node.id}.${o.name}`, { expr: r.expr, dyn, type });
        if (dyn) dynamic.add(`${node.id}.${o.name}`);
        if (probe && dyn && (type === 'num' || type === 'trig' || type === 'bool') && node.type !== '@reroute') parts.probes.push({ key: `${node.id}.${o.name}`, expr: r.expr });
      }
      parts.nodes.push({ node, def, setup: node.__setup, frame: node.__frame });
      if (node.__setup.length) parts.setup.push({ node, def, code: node.__setup });
      if (node.__frame.length) parts.frame.push({ node, def, code: node.__frame });
      delete node.__setup; delete node.__frame; delete node.__outs;
    }
    // required inputs that nothing feeds
    for (const node of graph.nodes) {
      const def = reg.get(node.type);
      for (const f of def?.inputs || []) if (f.required && !(into.get(`${node.id}.${f.name}`) || []).length) warnings.push({ node: node.id, message: `${def.title}: connect something to "${f.label}"` });
    }
    let code = '';
    try { code = reg.assemble(parts, graph, { errors, warnings, outs }); } catch (err) { errors.push({ message: err.message }); }
    return { code, parts, errors, warnings, dynamic, graph };
  }

  // ---------- small UI pieces ----------
  // A popup menu: items are [label, hint, fn, { checked, disabled }] , 'Section title' or '-'.
  let openMenu = null;
  function menu(x, y, items) {
    openMenu?.remove();
    const box = el('div', { class: 'nv-menu' });
    for (const it of items) {
      if (it === '-') { box.append(el('div', { class: 'nv-menu-sep' })); continue; }
      if (typeof it === 'string') { box.append(el('div', { class: 'nv-menu-sec', text: it })); continue; }
      if (!it) continue;
      const [label, hint, fn, o = {}] = it;
      box.append(el('button', { class: `nv-menu-item${o.checked ? ' on' : ''}`, disabled: Boolean(o.disabled), title: hint || '', on: { click: () => { close(); fn?.(); } } },
        el('span', { class: 'nv-menu-check', text: o.checked ? '✓' : '' }), el('span', { text: label }), o.key ? el('kbd', { text: o.key }) : null));
    }
    document.body.append(box);
    const r = box.getBoundingClientRect();
    box.style.left = `${clamp(x, 4, innerWidth - r.width - 4)}px`;
    box.style.top = `${clamp(y, 4, innerHeight - r.height - 4)}px`;
    const close = () => { box.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); if (openMenu === box) openMenu = null; };
    const away = (e) => { if (!box.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true); });
    openMenu = box;
    return { close };
  }

  // Easing curves for 'curve' widgets (names match the sandbox's ease.*).
  const EASES = {
    linear: (t) => t, inQuad: (t) => t * t, outQuad: (t) => 1 - (1 - t) * (1 - t), inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    inCubic: (t) => t ** 3, outCubic: (t) => 1 - (1 - t) ** 3, inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2, outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
    outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    outBounce: (t) => { const n = 7.5625; const d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  };
  const curvePath = (name, w = 34, h = 18) => {
    const f = EASES[name] || EASES.linear;
    let d = '';
    for (let i = 0; i <= 16; i += 1) { const t = i / 16; const v = clamp(f(t), -0.3, 1.3); d += `${i ? 'L' : 'M'}${(t * w).toFixed(1)} ${(h - 2 - v * (h - 4)).toFixed(1)}`; }
    return d;
  };
  // pointer capture (synthetic events from tests and scripts have no real pointer to capture)
  const capture = (node, e) => { try { node.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

  // ---------- the editor ----------
  // Extra options (all optional): hud: [{ text, title, run(api, button), cls }] buttons next to ＋ ⋯;
  // nodeMenu(node, api) → menu items added to a node's right-click menu (read-only graphs too);
  // onOpen(id) on double-click / Enter in a read-only graph; roMove: nodes of a read-only graph can still be arranged.
  function create(container, { registry: reg, graph: g0, onChange, onSelect, readOnly = false, menuItems, pickerExtras, live = true, storeKey = 'nodes', spacePan = true, hud: hudExtra = [], nodeMenu, onOpen, roMove = false } = {}) {
    let graph = normalize(g0 || emptyGraph(reg.name), reg);
    let view = { x: 40, y: 40, z: 1 };
    let ro = readOnly;
    const sel = new Set(); // node ids
    let selWire = null; // link index
    let selFrame = null;
    let snap = store.get(`${storeKey}.snap`, true);
    let showMini = store.get(`${storeKey}.minimap`, true);
    let dynamic = new Set();
    let errorsBy = new Map();
    const undoStack = []; const redoStack = [];
    let clipboard = null;
    const ports = new Map(); // node id → { in: { name: [dx, dy] }, out: {…}, w, h }
    const nodeEls = new Map();

    const nodesLayer = el('div', { class: 'nv-nodes' });
    const framesLayer = el('div', { class: 'nv-frames' });
    const wires = svg('svg', { class: 'nv-wires', width: '1', height: '1' });
    const tempWire = svg('path', { class: 'nv-wire temp' });
    const boxSel = el('div', { class: 'nv-boxsel', hidden: true });
    const canvas = el('div', { class: 'nv-canvas' }, framesLayer, wires, nodesLayer);
    const mini = el('canvas', { class: 'nv-minimap', width: 180, height: 112, title: 'Minimap: click or drag to move the view' });
    const zoomLbl = el('button', { class: 'nv-hud-btn nv-zoom', title: 'Zoom: click for 100%, double-click to fit (F)', text: '100%' });
    const status = el('div', { class: 'nv-status' });
    const searchBox = el('input', { class: 'nv-search', placeholder: 'Find a node…', hidden: true, spellcheck: false });
    const addBtn = el('button', { class: 'nv-hud-btn nv-add', text: '＋', title: 'Add a node (Tab or double-click the background)' });
    const moreBtn = el('button', { class: 'nv-hud-btn', text: '⋯', title: 'More: layout, fit, snap, minimap, frames, notes, undo' });
    // adapter buttons (▶ Run, Apply…) sit with ＋ and ⋯; a pill says when the graph is read-only
    const extraBtns = hudExtra.filter(Boolean).map((b) => { const x = el('button', { class: `nv-hud-btn ${b.cls || ''}`, text: b.text, title: b.title || '' }); x.addEventListener('click', () => b.run?.(api, x)); return x; });
    const roPill = el('span', { class: 'nv-ro-pill', text: 'read-only', title: 'This graph can be looked at, not changed', hidden: true });
    const hud = el('div', { class: 'nv-hud' }, addBtn, moreBtn, ...extraBtns, zoomLbl, roPill, searchBox);
    const root = el('div', { class: 'nv', tabIndex: 0 }, canvas, boxSel, hud, mini, status);
    // run status per node (adapters that run steps: queued · running · ok · warn · error · skip) and badges
    const runState = new Map(); // id → { state, text, pct }
    container.append(root);
    mini.hidden = !showMini;

    // ---------- coordinates ----------
    const rect = () => root.getBoundingClientRect();
    const toGraph = (cx, cy) => { const r = rect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; };
    const snapV = (v) => (snap ? Math.round(v / GRID) * GRID : v);
    function applyView() {
      canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
      root.style.backgroundPosition = `${view.x}px ${view.y}px`;
      root.style.backgroundSize = `${GRID * view.z * 4}px ${GRID * view.z * 4}px, ${GRID * view.z * 4}px ${GRID * view.z * 4}px, ${GRID * view.z}px ${GRID * view.z}px, ${GRID * view.z}px ${GRID * view.z}px`;
      root.classList.toggle('nv-far', view.z < 0.42);
      zoomLbl.textContent = `${Math.round(view.z * 100)}%`;
      drawMiniSoon();
    }
    function zoomAt(cx, cy, z) {
      const r = rect();
      const nz = clamp(z, 0.15, 2.5);
      const gx = (cx - r.left - view.x) / view.z; const gy = (cy - r.top - view.y) / view.z;
      view = { x: cx - r.left - gx * nz, y: cy - r.top - gy * nz, z: nz };
      applyView();
    }

    // ---------- helpers ----------
    const nodeById = (id) => graph.nodes.find((n) => n.id === id);
    const defOf = (n) => reg.get(n.type);
    const fieldsOf = (n) => defOf(n)?.fields || [];
    const linkInto = (id, port) => graph.links.filter((l) => l.to[0] === id && l.to[1] === port);
    // the type flowing out of a port (reroutes take their source's type)
    function outType(id, port, seen = new Set()) {
      const n = nodeById(id);
      if (!n) return 'any';
      if (n.type === '@reroute') { if (seen.has(id)) return 'any'; seen.add(id); const l = linkInto(id, 'in')[0]; return l ? outType(l.from[0], l.from[1], seen) : 'any'; }
      return defOf(n)?.outputs.find((o) => o.name === port)?.type || 'any';
    }
    const inType = (id, port) => { const n = nodeById(id); if (n?.type === '@reroute') return 'any'; return defOf(n)?.inputs.find((f) => f.name === port)?.type || 'any'; };
    function reaches(fromId, toId) { // does fromId feed (directly or not) toId?
      const seen = new Set(); const stack = [fromId];
      while (stack.length) { const id = stack.pop(); if (id === toId) return true; if (seen.has(id)) continue; seen.add(id); for (const l of graph.links) if (l.from[0] === id) stack.push(l.to[0]); }
      return false;
    }
    const snapshot = () => JSON.stringify(graph);
    let pendingBefore = null;
    const begin = () => { if (pendingBefore == null) pendingBefore = snapshot(); };
    function commit(kind = 'edit', extra = {}) {
      const before = pendingBefore ?? null;
      pendingBefore = null;
      if (before != null && before !== snapshot()) { undoStack.push(before); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; }
      onChange?.(clone(graph), { kind, ...extra });
      drawMiniSoon();
    }
    const change = (kind, fn, extra) => { begin(); fn(); commit(kind, extra); };

    // ---------- rendering ----------
    function renderAll() {
      nodesLayer.replaceChildren();
      nodeEls.clear(); ports.clear();
      for (const n of graph.nodes) renderNode(n);
      renderFrames();
      drawWires();
      paintSelection();
      drawMiniSoon();
    }
    function renderFrames() {
      framesLayer.replaceChildren(
        ...graph.frames.map((f) => {
          const title = el('div', { class: 'nv-frame-title', text: f.title || 'Group' });
          const fr = el('div', { class: `nv-frame${selFrame === f.id ? ' sel' : ''}`, dataset: { frame: f.id }, style: { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, '--fc': f.color || COLORS[0] } },
            el('div', { class: 'nv-frame-head' }, title), el('div', { class: 'nv-frame-resize' }));
          return fr;
        }),
        ...graph.notes.map((m) => {
          const txt = el('div', { class: 'nv-note-text', text: m.text || '', contentEditable: ro ? 'false' : 'true', spellcheck: false });
          txt.addEventListener('focus', () => begin());
          txt.addEventListener('blur', () => { if (m.text !== txt.innerText) { m.text = txt.innerText; commit('note'); } else pendingBefore = null; });
          return el('div', { class: 'nv-note', dataset: { note: m.id }, style: { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w || 200}px` } }, el('div', { class: 'nv-note-head', text: '✎ note' }), txt);
        }));
    }
    function liveKey(id, port) { return `${id}.${port}`; }
    function renderNode(n) {
      const def = defOf(n);
      if (!def) return;
      nodeEls.get(n.id)?.remove();
      const color = n.color || def.color || reg.typeColor(def.outputs[0]?.type);
      if (n.type === '@reroute') {
        const t = outType(n.id, 'out');
        const dot = el('div', { class: 'nv-node nv-reroute', dataset: { id: n.id }, style: { left: `${n.x}px`, top: `${n.y}px`, '--pc': reg.typeColor(t) } },
          el('span', { class: 'nv-port in', dataset: { node: n.id, port: 'in', dir: 'in' } }), el('span', { class: 'nv-port out', dataset: { node: n.id, port: 'out', dir: 'out' } }));
        nodesLayer.append(dot);
        nodeEls.set(n.id, dot);
        ports.set(n.id, { in: { in: [0, 0] }, out: { out: [0, 0] }, w: 0, h: 0, reroute: true });
        return;
      }
      const head = el('div', { class: 'nv-head' },
        el('span', { class: 'nv-dot' }),
        el('span', { class: 'nv-title', text: n.title || def.title, title: def.desc || def.title }),
        n.title ? el('span', { class: 'nv-sub', text: def.title }) : null,
        badgeOf(n, def) ? el('span', { class: 'nv-badge', text: badgeOf(n, def) }) : null,
        n.bypass ? el('span', { class: 'nv-bypass-mark', text: 'skip', title: 'Bypassed (M): its input passes straight through' }) : null,
        el('span', { class: 'nv-run', title: runState.get(n.id)?.text || '' }),
        el('button', { class: 'nv-col', text: n.collapsed ? '▸' : '▾', title: 'Collapse / expand (H)', dataset: { act: 'collapse' } }));
      const body = el('div', { class: 'nv-body' });
      for (const o of def.outputs) {
        const t = n.type === '@reroute' ? outType(n.id, o.name) : o.type;
        body.append(el('div', { class: 'nv-row out' },
          el('span', { class: 'nv-live', dataset: { k: liveKey(n.id, o.name) } }),
          el('span', { class: 'nv-lbl', text: o.label }),
          el('span', { class: 'nv-port out', title: `${o.label} (${reg.types[t]?.label || t})`, dataset: { node: n.id, port: o.name, dir: 'out' }, style: { '--pc': reg.typeColor(t) } })));
      }
      for (const f of def.widgets) body.append(widgetRow(n, f));
      for (const f of def.inputs) {
        const linked = linkInto(n.id, f.name).length > 0;
        const row = el('div', { class: `nv-row in${linked ? ' linked' : ''}${f.multi ? ' multi' : ''}` },
          el('span', { class: `nv-port in${f.multi ? ' multi' : ''}`, title: `${f.label} (${reg.types[f.type]?.label || f.type})${f.multi ? ' · takes several' : ''}${f.hint ? `\n${f.hint}` : ''}`, dataset: { node: n.id, port: f.name, dir: 'in' }, style: { '--pc': reg.typeColor(f.type) } }));
        if (!linked && f.kind) row.append(widget(n, f));
        else row.append(el('span', { class: 'nv-lbl', text: f.label + (f.multi && linked ? ` · ${linkInto(n.id, f.name).length}` : '') }));
        body.append(row);
      }
      const node = el('div', { class: `nv-node${n.collapsed ? ' collapsed' : ''}${n.bypass ? ' bypass' : ''}`, dataset: { id: n.id, cat: def.category }, style: { left: `${n.x}px`, top: `${n.y}px`, '--nc': color, ...(def.width ? { width: `${def.width}px` } : {}) } }, head, body, el('div', { class: 'nv-progress' }));
      if (errorsBy.has(n.id)) { node.classList.add('err'); node.title = errorsBy.get(n.id); }
      nodesLayer.append(node);
      nodeEls.set(n.id, node);
      paintRun(n.id);
      measure(n.id);
    }
    // a short label in the header: the node's own (n.badge) or its type's (def.badge(node) → text)
    function badgeOf(n, def) { try { return n.badge || def.badge?.(n) || ''; } catch { return ''; } }
    const RUN_ICON = { queued: '◌', running: '◐', ok: '✓', warn: '!', error: '✕', skip: '–', wait: '⏸' };
    function paintRun(id) {
      const node = nodeEls.get(id);
      if (!node) return;
      const r = runState.get(id);
      for (const k of Object.keys(RUN_ICON)) node.classList.toggle(`run-${k}`, r?.state === k);
      const b = node.querySelector('.nv-run');
      if (b) { b.textContent = r ? RUN_ICON[r.state] || '' : ''; b.title = r?.text || ''; }
      const p = node.querySelector('.nv-progress');
      if (p) { p.hidden = !(r && r.pct != null && r.state === 'running'); p.style.setProperty('--pct', `${clamp(r?.pct || 0, 0, 1) * 100}%`); }
      if (r?.text && r.state !== 'queued') node.dataset.runText = r.text; else delete node.dataset.runText;
    }
    // where each port sits inside its node (graph units)
    function measure(id) {
      const node = nodeEls.get(id);
      const n = nodeById(id);
      if (!node || !n) return;
      if (n.type === '@reroute') return;
      const P = { in: {}, out: {}, w: node.offsetWidth, h: node.offsetHeight };
      for (const p of node.querySelectorAll('.nv-port')) {
        let x = p.offsetWidth / 2; let y = p.offsetHeight / 2; let e = p;
        while (e && e !== node) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
        P[p.dataset.dir][p.dataset.port] = [x, y];
      }
      ports.set(id, P);
    }
    function portPos(id, port, dir) {
      const n = nodeById(id);
      const P = ports.get(id);
      if (!n || !P) return null;
      if (P.reroute) return { x: n.x, y: n.y };
      if (n.collapsed) return { x: n.x + (dir === 'out' ? P.w : 0), y: n.y + 14 };
      const p = P[dir][port];
      return p ? { x: n.x + p[0], y: n.y + p[1] } : { x: n.x + (dir === 'out' ? P.w : 0), y: n.y + 14 };
    }
    const wirePath = (a, b) => { const dx = Math.max(36, Math.abs(b.x - a.x) * 0.5); return `M${a.x} ${a.y}C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`; };
    function drawWires() {
      const frag = document.createDocumentFragment();
      graph.links.forEach((l, i) => {
        const a = portPos(l.from[0], l.from[1], 'out'); const b = portPos(l.to[0], l.to[1], 'in');
        if (!a || !b) return;
        const d = wirePath(a, b);
        const t = outType(l.from[0], l.from[1]);
        const isLive = live && dynamic.has(`${l.from[0]}.${l.from[1]}`);
        // a wire into a running step flows too, and one out of a finished step stays lit
        const isRun = runState.get(l.to[0])?.state === 'running' && runState.get(l.from[0])?.state === 'ok';
        const g = svg('g', { class: `nv-link${selWire === i ? ' sel' : ''}${isLive || isRun ? ' live' : ''}${isRun ? ' run' : ''}${hoverId && (l.from[0] === hoverId || l.to[0] === hoverId) ? ' hl' : ''}`, 'data-link': String(i), 'data-a': l.from[0], 'data-b': l.to[0], style: `--pc:${reg.typeColor(t)}` });
        g.append(svg('path', { class: 'nv-wire-hit', d }), svg('path', { class: 'nv-wire', d }));
        if (isLive || isRun) g.append(svg('path', { class: 'nv-wire-flow', d }));
        frag.append(g);
      });
      wires.replaceChildren(frag, tempWire);
    }
    // hovering a node lights up its wires (what feeds it and what it feeds); the others dim
    let hoverId = null;
    function traceHover(id) {
      if (id === hoverId) return;
      hoverId = id;
      root.classList.toggle('nv-tracing', Boolean(id) && graph.links.some((l) => l.from[0] === id || l.to[0] === id));
      for (const g of wires.querySelectorAll('.nv-link')) g.classList.toggle('hl', Boolean(id) && (g.dataset.a === id || g.dataset.b === id));
    }
    nodesLayer.addEventListener('pointerover', (e) => { if (!drag) traceHover(e.target.closest('.nv-node')?.dataset.id || null); });
    nodesLayer.addEventListener('pointerleave', () => traceHover(null));
    let wiresQueued = false;
    const drawWiresSoon = () => { if (wiresQueued) return; wiresQueued = true; requestAnimationFrame(() => { wiresQueued = false; drawWires(); }); };
    function paintSelection() {
      for (const [id, node] of nodeEls) node.classList.toggle('sel', sel.has(id));
      onSelect?.([...sel]);
    }

    // ---------- inline widgets ----------
    function setValue(n, f, v, { final = true } = {}) {
      if (final) begin();
      n.values[f.name] = v;
      if (final) { commit('value', { node: n.id, field: f.name, value: v }); if (fieldsOf(n).some((x) => x.minFrom === f.name || x.maxFrom === f.name)) { renderNode(n); drawWires(); } }
      else onChange?.(clone(graph), { kind: 'value', live: true, node: n.id, field: f.name, value: v });
    }
    function widgetRow(n, f) { return el('div', { class: 'nv-row w' }, widget(n, f)); }
    function sliderBadge(n, f) {
      if (!reg.sliderLabel || !['number', 'knob', 'color', 'toggle', 'select'].includes(f.kind)) return null;
      const on = n.sliders?.[f.name] ?? f.slider ?? defOf(n).sliders ?? true;
      return on ? el('span', { class: 'nv-slider-mark', title: 'Shows as a slider in the Lab (right-click to change)', text: '⚡' }) : null;
    }
    function widget(n, f) {
      const v = n.values[f.name] ?? f.value;
      const wrap = el('div', { class: `nv-widget k-${f.kind}`, dataset: { node: n.id, field: f.name }, title: f.hint || '' });
      if (f.kind === 'number' || f.kind === 'knob') {
        const min = Number(f.minFrom ? n.values[f.minFrom] : f.min ?? 0); const max = Number(f.maxFrom ? n.values[f.maxFrom] : f.max ?? Math.max(1, Math.abs(v) * 2 || 1));
        const step = f.step || 0;
        const q = (x) => { let y = clamp(x, f.hardMin ?? -Infinity, f.hardMax ?? Infinity); if (step) y = Math.round(y / step) * step; return Math.round(y * 1e5) / 1e5; };
        if (f.kind === 'knob') {
          const arc = svg('path', { class: 'nv-knob-arc' });
          const ring = svg('svg', { class: 'nv-knob', viewBox: '0 0 24 24', width: '22', height: '22' });
          ring.append(svg('circle', { cx: '12', cy: '12', r: '9', class: 'nv-knob-bg' }), arc);
          const val = el('span', { class: 'nv-num-val', text: fmt(v) });
          const paint = (x) => {
            const t = clamp((x - min) / (max - min || 1), 0, 1); const a0 = Math.PI * 0.75; const a1 = a0 + t * Math.PI * 1.5;
            const p = (a) => `${12 + 9 * Math.cos(a)} ${12 + 9 * Math.sin(a)}`;
            arc.setAttribute('d', `M${p(a0)}A9 9 0 ${t > 2 / 3 ? 1 : 0} 1 ${p(a1)}`);
            val.textContent = fmt(x);
          };
          paint(v);
          wrap.append(ring, el('span', { class: 'nv-num-lbl', text: f.label }), sliderBadge(n, f), val);
          dragValue(wrap, n, f, () => n.values[f.name] ?? f.value, (x, final) => { const y = q(x); paint(y); setValue(n, f, y, { final }); }, (max - min) / 150, true);
        } else {
          const fill = el('div', { class: 'nv-num-fill' });
          const val = el('span', { class: 'nv-num-val', text: fmt(v) });
          const paint = (x) => { fill.style.width = `${clamp((x - min) / (max - min || 1), 0, 1) * 100}%`; val.textContent = fmt(x); };
          paint(v);
          wrap.append(fill, el('span', { class: 'nv-num-lbl', text: f.label }), sliderBadge(n, f), val);
          dragValue(wrap, n, f, () => n.values[f.name] ?? f.value, (x, final) => { const y = q(x); paint(y); setValue(n, f, y, { final }); }, null, false, () => ({ min, max, width: wrap.offsetWidth }));
        }
        return wrap;
      }
      if (f.kind === 'color') {
        const inp = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff', disabled: ro });
        inp.addEventListener('input', () => setValue(n, f, inp.value, { final: false }));
        inp.addEventListener('change', () => setValue(n, f, inp.value));
        wrap.append(inp, el('span', { class: 'nv-num-lbl', text: f.label }), sliderBadge(n, f), el('span', { class: 'nv-num-val', text: String(v).toLowerCase() }));
        return wrap;
      }
      if (f.kind === 'toggle') {
        const b = el('button', { class: `nv-toggle${v ? ' on' : ''}`, disabled: ro, text: v ? 'on' : 'off' });
        b.addEventListener('click', () => { const nv = !(n.values[f.name] ?? f.value); b.classList.toggle('on', nv); b.textContent = nv ? 'on' : 'off'; setValue(n, f, nv); });
        wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }), sliderBadge(n, f), b);
        return wrap;
      }
      if (f.kind === 'select' || f.kind === 'curve') {
        const opts = f.kind === 'curve' ? (f.options || Object.keys(EASES)) : f.options;
        const s = el('select', { disabled: ro }, opts.map((o) => { const val = typeof o === 'object' ? o.value : o; return el('option', { value: val, text: typeof o === 'object' ? o.label : val, selected: val === v }); }));
        s.addEventListener('change', () => { setValue(n, f, s.value); if (f.kind === 'curve') curve.firstChild.setAttribute('d', curvePath(s.value)); if (f.rebuild) renderNode(n); });
        const curve = f.kind === 'curve' ? (() => { const c = svg('svg', { class: 'nv-curve', width: '34', height: '18' }); c.append(svg('path', { d: curvePath(v) })); return c; })() : null;
        wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }), f.kind === 'select' ? sliderBadge(n, f) : null, curve, s);
        return wrap;
      }
      if (f.kind === 'text' || f.kind === 'code') {
        const inp = el(f.kind === 'code' ? 'textarea' : 'input', { value: String(v ?? ''), placeholder: f.placeholder || f.label, spellcheck: false, disabled: ro, rows: f.rows || 2 });
        inp.addEventListener('change', () => setValue(n, f, inp.value));
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        wrap.append(f.kind === 'code' ? null : el('span', { class: 'nv-num-lbl', text: f.label }), inp);
        return wrap;
      }
      // several of a list: chips that toggle (value: array of the chosen options)
      if (f.kind === 'multi') {
        const chosen = new Set(Array.isArray(v) ? v : []);
        const box = el('div', { class: 'nv-chips' });
        for (const o of f.options || []) {
          const val = typeof o === 'object' ? o.value : o;
          const chip = el('button', { class: `nv-chip${chosen.has(val) ? ' on' : ''}`, disabled: ro, text: typeof o === 'object' ? o.label : val });
          chip.addEventListener('click', () => { if (chosen.has(val)) chosen.delete(val); else chosen.add(val); chip.classList.toggle('on', chosen.has(val)); setValue(n, f, (f.options || []).map((x) => (typeof x === 'object' ? x.value : x)).filter((x) => chosen.has(x))); });
          box.append(chip);
        }
        wrap.append(f.label ? el('span', { class: 'nv-num-lbl', text: f.label }) : null, box);
        return wrap;
      }
      // a from – to pair (seconds, frames…): drag either number, click to type
      if (f.kind === 'range') {
        const arr = Array.isArray(v) ? v.slice(0, 2) : [0, 1];
        const short = (y) => fmt(Math.round(y * 1000) / 1000);
        const box = el('div', { class: 'nv-vec nv-range' });
        arr.forEach((x, i) => {
          const cell = el('div', { class: 'nv-vec-cell', text: short(x), title: `${i ? 'To' : 'From'}: drag or click to type` });
          dragValue(cell, n, f, () => (n.values[f.name] ?? f.value)[i], (y, final) => { const next = [...(n.values[f.name] ?? f.value)]; next[i] = clamp(Math.round(y * 1000) / 1000, f.min ?? -Infinity, f.max ?? Infinity); if (next[0] > next[1]) next[1 - i] = next[i]; cell.textContent = short(next[i]); setValue(n, f, next, { final }); }, f.step || 0.05);
          box.append(cell);
          if (!i) box.append(el('span', { class: 'nv-range-dash', text: '–' }));
        });
        wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }), box);
        return wrap;
      }
      // text with a ▾ list of suggestions (f.choices(node) → [{ value, label?, hint? }], may be async)
      if (f.kind === 'pick') {
        const inp = el('input', { value: String(v ?? ''), placeholder: f.placeholder || f.label, spellcheck: false, disabled: ro });
        inp.addEventListener('change', () => setValue(n, f, inp.value));
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        const more = el('button', { class: 'nv-pick-btn', text: '▾', disabled: ro, title: 'Choose from a list' });
        more.addEventListener('click', async () => {
          let list = [];
          try { list = (await f.choices?.(n)) || []; } catch { /* no list */ }
          const r = more.getBoundingClientRect();
          menu(r.left, r.bottom + 2, list.length ? [f.label, ...list.slice(0, 40).map((c) => [c.label || String(c.value), c.hint || '', () => { inp.value = c.value; setValue(n, f, c.value); }, { checked: c.value === (n.values[f.name] ?? f.value) }])] : [['Nothing to choose from yet', '', null, { disabled: true }]]);
        });
        wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }), inp, more);
        return wrap;
      }
      // a button inside the node (f.action(node, api))
      if (f.kind === 'button') {
        const b = el('button', { class: 'nv-wbtn', text: f.label, title: f.hint || '' });
        b.addEventListener('click', () => f.action?.(n, api));
        wrap.append(b);
        return wrap;
      }
      // read-only text (code excerpts, results): selectable, never edited
      if (f.kind === 'info') {
        const txt = typeof f.text === 'function' ? f.text(n) : v;
        wrap.append(el('div', { class: `nv-info${f.mono ? ' mono' : ''}`, text: String(txt ?? '') }));
        return wrap;
      }
      // a list of colors (ramps, palettes): click a swatch to change it, right-click removes, ＋ adds
      if (f.kind === 'gradient') {
        const list = Array.isArray(v) && v.length ? v.slice() : ['#000000', '#ffffff'];
        const box = el('div', { class: 'nv-swatches' });
        const save = () => setValue(n, f, list.slice());
        list.forEach((c, i) => {
          const sw = el('input', { type: 'color', class: 'nv-swatch', value: /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff', disabled: ro, title: `${c} · right-click to remove` });
          sw.addEventListener('input', () => { list[i] = sw.value; setValue(n, f, list.slice(), { final: false }); });
          sw.addEventListener('change', () => { list[i] = sw.value; save(); });
          sw.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (ro || list.length <= (f.minColors || 2)) return; list.splice(i, 1); save(); renderNode(n); drawWires(); });
          box.append(sw);
        });
        if (!ro && list.length < (f.maxColors || 8)) {
          const add = el('button', { class: 'nv-pick-btn', text: '＋', title: 'Add a color' });
          add.addEventListener('click', () => { list.push(list[list.length - 1]); save(); renderNode(n); drawWires(); });
          box.append(add);
        }
        wrap.append(f.label ? el('span', { class: 'nv-num-lbl', text: f.label }) : null, box);
        return wrap;
      }
      if (f.kind === 'vec') {
        const arr = Array.isArray(v) ? v.slice(0, 3) : [0, 0, 0];
        wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }));
        const box = el('div', { class: 'nv-vec' });
        arr.forEach((x, i) => {
          const short = (y) => String(Math.round(y * 100) / 100);
          const cell = el('div', { class: 'nv-vec-cell', text: short(x), title: `${'xyz'[i]}: drag or click to type` });
          dragValue(cell, n, f, () => (n.values[f.name] ?? f.value)[i], (y, final) => { const next = [...(n.values[f.name] ?? f.value)]; next[i] = Math.round(y * 1000) / 1000; cell.textContent = short(next[i]); setValue(n, f, next, { final }); }, f.step || 0.02);
          box.append(cell);
        });
        wrap.append(box);
        return wrap;
      }
      wrap.append(el('span', { class: 'nv-num-lbl', text: f.label }));
      return wrap;
    }
    // Drag left/right (or up/down for knobs) to change a number; click to type one. Shift = fine.
    function dragValue(target, n, f, get, set, perPx, vertical = false, range = null) {
      target.addEventListener('pointerdown', (e) => {
        if (ro || e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        const x0 = e.clientX; const y0 = e.clientY; const v0 = get(); let moved = false;
        capture(target, e);
        begin();
        const move = (ev) => {
          const d = vertical ? y0 - ev.clientY : ev.clientX - x0;
          if (!moved && Math.abs(d) < 3) return;
          moved = true;
          const fine = ev.shiftKey ? 0.1 : 1;
          let next;
          if (range) { const r = range(); next = v0 + (d / view.z / Math.max(140, r.width)) * (r.max - r.min) * fine; } else next = v0 + d * (perPx || 0.01) * fine;
          set(next, false);
        };
        const up = (ev) => {
          target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up);
          if (moved) { const d = vertical ? y0 - ev.clientY : ev.clientX - x0; const fine = ev.shiftKey ? 0.1 : 1; let next; if (range) { const r = range(); next = v0 + (d / view.z / Math.max(140, r.width)) * (r.max - r.min) * fine; } else next = v0 + d * (perPx || 0.01) * fine; set(next, true); return; }
          pendingBefore = null;
          // a click: type the value
          const inp = el('input', { class: 'nv-num-input', value: String(v0) });
          target.append(inp); inp.focus(); inp.select();
          const done = (ok) => { const x = Number(inp.value); inp.remove(); if (ok && Number.isFinite(x)) set(x, true); };
          inp.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); });
          inp.addEventListener('blur', () => done(true));
        };
        target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
      });
    }

    // ---------- graph edits ----------
    function addNode(type, { x, y, values, title, id } = {}) {
      const def = reg.get(type);
      if (!def) throw new Error(`Unknown node type "${type}"`);
      // no position given (chat, the director): to the right of everything, so nothing ends up hidden under it
      const b = x == null && graph.nodes.length ? bounds(null) : null;
      const c = x == null ? (b ? { x: b.x + b.w + 60, y: b.y } : centerGraph()) : { x, y };
      const n = { id: id && !nodeById(id) ? id : reg.idFor(def, graph), type, x: snapV(c.x), y: snapV(c.y), values: {} };
      for (const f of def.fields) if (f.value !== undefined) n.values[f.name] = clone(f.value);
      Object.assign(n.values, values || {});
      if (title) n.title = title;
      graph.nodes.push(n);
      renderNode(n);
      return n;
    }
    function connect(fromId, fromPort, toId, toPort, { quiet = false } = {}) {
      const a = nodeById(fromId); const b = nodeById(toId);
      if (!a || !b || a === b) return false;
      const field = defOf(b)?.inputs.find((f) => f.name === toPort);
      if (!field || !defOf(a)?.outputs.some((o) => o.name === fromPort)) return false;
      if (!reg.compatible(outType(fromId, fromPort), inType(toId, toPort))) { if (!quiet) toast(`Can't connect ${reg.types[outType(fromId, fromPort)]?.label || outType(fromId, fromPort)} to ${reg.types[field.type]?.label || field.type}`, { type: 'error', timeout: 2000 }); return false; }
      if (reaches(toId, fromId)) { if (!quiet) toast('That would make a loop', { type: 'error', timeout: 2000 }); return false; }
      if (!field.multi) graph.links = graph.links.filter((l) => !(l.to[0] === toId && l.to[1] === toPort));
      else if (graph.links.some((l) => l.to[0] === toId && l.to[1] === toPort && l.from[0] === fromId && l.from[1] === fromPort)) return false;
      graph.links.push({ from: [fromId, fromPort], to: [toId, toPort] });
      renderNode(b);
      if (b.type === '@reroute') refreshReroutes();
      return true;
    }
    function refreshReroutes() { for (const n of graph.nodes) if (n.type === '@reroute') renderNode(n); }
    function removeNodes(ids) {
      const set = new Set(ids);
      // keep chains working: a deleted single-in/single-out node is bridged when the types allow
      const touched = new Set();
      graph.links = graph.links.filter((l) => { const hit = set.has(l.from[0]) || set.has(l.to[0]); if (hit) { touched.add(l.from[0]); touched.add(l.to[0]); } return !hit; });
      graph.nodes = graph.nodes.filter((n) => !set.has(n.id));
      for (const id of ids) { nodeEls.get(id)?.remove(); nodeEls.delete(id); ports.delete(id); sel.delete(id); }
      for (const id of touched) { const n = nodeById(id); if (n) renderNode(n); }
    }
    function centerGraph() { const r = rect(); return toGraph(r.left + r.width / 2 - 90, r.top + r.height / 2 - 40); }

    // ---------- pointer ----------
    let drag = null;
    let spaceDown = false;
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nv-hud, .nv-minimap, .nv-picker, .nv-note-text:focus, input, select, textarea')) return;
      root.focus({ preventScroll: true });
      closePicker();
      const port = e.target.closest('.nv-port');
      const nodeEl = e.target.closest('.nv-node');
      const frameEl = e.target.closest('.nv-frame');
      const noteEl = e.target.closest('.nv-note');
      const linkEl = e.target.closest('.nv-link');
      const pan = e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown);
      if (pan) { drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, v0: { ...view }, moved: false }; capture(root, e); return; }
      if (e.button !== 0) return;
      if (port && !ro) { startWire(port, e); return; }
      if (e.target.closest('[data-act="collapse"]') && nodeEl) { const n = nodeById(nodeEl.dataset.id); change('collapse', () => { n.collapsed = !n.collapsed; renderNode(n); drawWires(); }); return; }
      if (nodeEl) { startNodeDrag(nodeEl.dataset.id, e); return; }
      if (linkEl) { selWire = Number(linkEl.dataset.link); sel.clear(); selFrame = null; paintSelection(); drawWires(); if (e.altKey || e.detail === 2) insertReroute(selWire, toGraph(e.clientX, e.clientY)); return; }
      if (noteEl && !e.target.closest('.nv-note-text')) { startMove(e, [], [], [noteEl.dataset.note]); return; }
      if (frameEl) {
        const f = graph.frames.find((x) => x.id === frameEl.dataset.frame);
        if (e.target.closest('.nv-frame-resize') && !ro) { begin(); drag = { kind: 'resize', f, x0: e.clientX, y0: e.clientY, w0: f.w, h0: f.h }; capture(root, e); return; }
        if (e.target.closest('.nv-frame-head')) {
          if (e.detail === 2 && !ro) { renameFrame(f); return; }
          selFrame = f.id; renderFrames();
          const inside = graph.nodes.filter((n) => n.x >= f.x && n.y >= f.y && n.x < f.x + f.w && n.y < f.y + f.h).map((n) => n.id);
          const notes = graph.notes.filter((m) => m.x >= f.x && m.y >= f.y && m.x < f.x + f.w && m.y < f.y + f.h).map((m) => m.id);
          startMove(e, inside, [f.id], notes);
          return;
        }
      }
      // background: box select (double-click opens the node picker)
      if (e.detail === 2 && !ro) { openPicker({ cx: e.clientX, cy: e.clientY }); return; }
      if (!e.shiftKey && !e.ctrlKey) { sel.clear(); selWire = null; selFrame = null; paintSelection(); drawWires(); renderFrames(); }
      const p = toGraph(e.clientX, e.clientY);
      drag = { kind: 'box', p0: p, add: e.shiftKey || e.ctrlKey, base: new Set(sel) };
      capture(root, e);
    });
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (drag?.kind === 'pan' && drag.moved) return;
      contextMenu(e);
    });
    root.addEventListener('pointermove', (e) => {
      lastPointer = { cx: e.clientX, cy: e.clientY };
      if (!drag) return;
      if (drag.kind === 'pan') {
        const dx = e.clientX - drag.x0; const dy = e.clientY - drag.y0;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        view = { ...drag.v0, x: drag.v0.x + dx, y: drag.v0.y + dy };
        applyView();
      } else if (drag.kind === 'move') {
        const dx = (e.clientX - drag.x0) / view.z; const dy = (e.clientY - drag.y0) / view.z;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        if (!drag.moved) { drag.moved = true; begin(); if (drag.dup) duplicateInPlace(); }
        for (const [id, p] of drag.start) {
          const n = nodeById(id); if (!n) continue;
          n.x = snapV(p.x + dx); n.y = snapV(p.y + dy);
          const node = nodeEls.get(id); if (node) { node.style.left = `${n.x}px`; node.style.top = `${n.y}px`; }
        }
        for (const [id, p] of drag.frames) { const f = graph.frames.find((x) => x.id === id); if (f) { f.x = snapV(p.x + dx); f.y = snapV(p.y + dy); } }
        for (const [id, p] of drag.notes) { const m = graph.notes.find((x) => x.id === id); if (m) { m.x = snapV(p.x + dx); m.y = snapV(p.y + dy); } }
        if (drag.frames.size || drag.notes.size) renderFrames();
        drawWiresSoon();
      } else if (drag.kind === 'resize') {
        drag.f.w = Math.max(160, snapV(drag.w0 + (e.clientX - drag.x0) / view.z));
        drag.f.h = Math.max(100, snapV(drag.h0 + (e.clientY - drag.y0) / view.z));
        renderFrames();
      } else if (drag.kind === 'wire') {
        const p = toGraph(e.clientX, e.clientY);
        const a = drag.dir === 'out' ? drag.a : p; const b = drag.dir === 'out' ? p : drag.a;
        tempWire.setAttribute('d', wirePath(a, b));
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.nv-port');
        for (const x of root.querySelectorAll('.nv-port.hot')) if (x !== over) x.classList.remove('hot');
        if (over && over.dataset.dir !== drag.dir) over.classList.add('hot');
      } else if (drag.kind === 'box') {
        const p = toGraph(e.clientX, e.clientY);
        const x = Math.min(p.x, drag.p0.x); const y = Math.min(p.y, drag.p0.y); const w = Math.abs(p.x - drag.p0.x); const h = Math.abs(p.y - drag.p0.y);
        if (w + h < 4) return;
        boxSel.hidden = false;
        Object.assign(boxSel.style, { left: `${x * view.z + view.x}px`, top: `${y * view.z + view.y}px`, width: `${w * view.z}px`, height: `${h * view.z}px` });
        sel.clear();
        for (const id of drag.base) sel.add(id);
        for (const n of graph.nodes) {
          const P = ports.get(n.id) || { w: 10, h: 10 };
          if (n.x + (P.w || 10) > x && n.x < x + w && n.y + (P.h || 10) > y && n.y < y + h) sel.add(n.id);
        }
        paintSelection();
      }
    });
    root.addEventListener('pointerup', (e) => {
      const d = drag;
      drag = null;
      if (!d) return;
      if (d.kind === 'move') {
        if (d.moved) commit('move'); else if (d.clickSelect) { sel.clear(); sel.add(d.clickSelect); paintSelection(); }
      }
      if (d.kind === 'resize') commit('frame');
      if (d.kind === 'box') boxSel.hidden = true;
      if (d.kind === 'wire') endWire(d, e);
    });
    root.addEventListener('wheel', (e) => {
      if (e.target.closest('.nv-picker, .nv-menu, textarea')) return;
      e.preventDefault();
      const trackpad = !e.ctrlKey && (Math.abs(e.deltaX) > 0 || (e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)));
      if (trackpad || e.shiftKey) { view.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; view.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; applyView(); return; }
      zoomAt(e.clientX, e.clientY, view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });

    function startMove(e, ids, frameIds = [], noteIds = []) {
      if (ro && !roMove) return;
      drag = { kind: 'move', x0: e.clientX, y0: e.clientY, moved: false,
        start: new Map(ids.map((id) => { const n = nodeById(id); return [id, { x: n.x, y: n.y }]; })),
        frames: new Map(frameIds.map((id) => { const f = graph.frames.find((x) => x.id === id); return [id, { x: f.x, y: f.y }]; })),
        notes: new Map(noteIds.map((id) => { const m = graph.notes.find((x) => x.id === id); return [id, { x: m.x, y: m.y }]; })) };
      capture(root, e);
    }
    function startNodeDrag(id, e) {
      selWire = null;
      let clickSelect = null;
      if (e.shiftKey || e.ctrlKey) { if (sel.has(id)) sel.delete(id); else sel.add(id); } else if (!sel.has(id)) { sel.clear(); sel.add(id); } else clickSelect = id;
      paintSelection();
      if (e.detail === 2 && !e.target.closest('.nv-widget')) { if (ro) onOpen?.(id); else renameNode(id); return; }
      startMove(e, [...sel]);
      if (drag) { drag.clickSelect = clickSelect; drag.dup = e.altKey && !ro; }
    }
    function duplicateInPlace() {
      const copies = copyOf([...sel]);
      const map = pasteData(copies, { dx: 0, dy: 0 });
      drag.start = new Map([...drag.start].map(([id, p]) => [map.get(id), p]).filter(([id]) => id));
    }
    function startWire(port, e) {
      const id = port.dataset.node; const name = port.dataset.port; const dir = port.dataset.dir;
      // dragging a connected input picks its wire up
      if (dir === 'in') {
        const ls = linkInto(id, name);
        if (ls.length && !port.classList.contains('multi')) {
          begin();
          const l = ls[ls.length - 1];
          graph.links = graph.links.filter((x) => x !== l);
          renderNode(nodeById(id));
          drawWires();
          drag = { kind: 'wire', dir: 'out', id: l.from[0], port: l.from[1], a: portPos(l.from[0], l.from[1], 'out'), picked: true };
          capture(root, e);
          return;
        }
      }
      drag = { kind: 'wire', dir, id, port: name, a: portPos(id, name, dir) };
      capture(root, e);
    }
    function endWire(d, e) {
      tempWire.setAttribute('d', '');
      for (const x of root.querySelectorAll('.nv-port.hot')) x.classList.remove('hot');
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.nv-port');
      if (over && over.dataset.dir !== d.dir) {
        begin();
        const ok = d.dir === 'out' ? connect(d.id, d.port, over.dataset.node, over.dataset.port) : connect(over.dataset.node, over.dataset.port, d.id, d.port);
        drawWires();
        if (ok || d.picked) commit('connect'); else pendingBefore = null;
        return;
      }
      if (d.picked) { commit('disconnect'); return; }
      // dropped on empty space: pick a node that fits, it gets connected
      openPicker({ cx: e.clientX, cy: e.clientY, from: d });
    }
    function insertReroute(i, p) {
      const l = graph.links[i];
      if (!l) return;
      change('reroute', () => {
        const r = addNode('@reroute', { x: p.x, y: p.y });
        graph.links.splice(i, 1);
        graph.links.push({ from: l.from, to: [r.id, 'in'] }, { from: [r.id, 'out'], to: l.to });
        selWire = null;
        renderNode(r);
        drawWires();
      });
    }

    // ---------- node picker ----------
    let picker = null;
    let lastPointer = null;
    function closePicker() { picker?.remove(); picker = null; }
    function openPicker({ cx, cy, from = null } = {}) {
      closePicker();
      if (ro) return;
      const r = rect();
      if (cx == null) { cx = lastPointer?.cx ?? r.left + r.width / 2; cy = lastPointer?.cy ?? r.top + r.height / 2; }
      const at = toGraph(cx, cy);
      const fromType = from ? (from.dir === 'out' ? outType(from.id, from.port) : inType(from.id, from.port)) : null;
      // each candidate: a node type and (when dragging a wire) the port it would connect with
      const cands = [];
      for (const def of reg.list()) {
        if (!from) { cands.push({ def }); continue; }
        const list = from.dir === 'out' ? def.inputs : def.outputs;
        const p = list.find((x) => (from.dir === 'out' ? reg.compatible(fromType, x.type) : reg.compatible(x.type, fromType)) && x.type !== 'any') || list.find((x) => (from.dir === 'out' ? reg.compatible(fromType, x.type) : reg.compatible(x.type, fromType)));
        if (p) cands.push({ def, port: p.name, exact: p.type === fromType });
      }
      const extras = (!from && pickerExtras?.()) || [];
      const input = el('input', { class: 'nv-picker-q', placeholder: from ? `Nodes that take ${reg.types[fromType]?.label || fromType}…` : 'Add a node… (type to search)', spellcheck: false });
      const listBox = el('div', { class: 'nv-picker-list' });
      const info = el('div', { class: 'nv-picker-info' });
      picker = el('div', { class: 'nv-picker' }, input, listBox, info);
      root.append(picker);
      const pr = picker.getBoundingClientRect();
      picker.style.left = `${clamp(cx - r.left, 4, r.width - pr.width - 4)}px`;
      picker.style.top = `${clamp(cy - r.top, 4, Math.max(4, r.height - pr.height - 4))}px`;
      let shown = []; let active = 0;
      const score = (c, q) => {
        if (!q) return c.exact ? 2 : 1;
        const t = `${c.def?.title || c.label} ${c.def?.type || ''} ${c.def?.category || c.category || ''} ${c.def?.keywords || ''} ${c.def?.desc || c.desc || ''}`.toLowerCase();
        const title = (c.def?.title || c.label).toLowerCase();
        if (title.startsWith(q)) return 5; if (title.includes(q)) return 4;
        return q.split(/\s+/).every((w) => t.includes(w)) ? 2 : 0;
      };
      function paint() {
        const q = input.value.trim().toLowerCase();
        const all = [...cands, ...extras.map((x) => ({ extra: x, label: x.label, category: x.category || 'More', desc: x.desc }))];
        shown = all.map((c) => [c, score(c, q)]).filter(([, s]) => s > 0).sort((a, b) => (q ? b[1] - a[1] : 0)).map(([c]) => c);
        if (!q) { const cats = reg.categories(); const ci = (c) => { const i = cats.indexOf(c.def?.category ?? ''); return i < 0 ? 999 : i; }; shown.sort((a, b) => ci(a) - ci(b) || (b.exact ? 1 : 0) - (a.exact ? 1 : 0)); }
        active = clamp(active, 0, Math.max(0, shown.length - 1));
        listBox.replaceChildren();
        let cat = null;
        shown.slice(0, 160).forEach((c, i) => {
          const category = c.def?.category || c.category;
          if (!q && category !== cat) { cat = category; listBox.append(el('div', { class: 'nv-picker-cat', text: cat })); }
          const color = c.def ? (c.def.color || reg.typeColor(c.def.outputs[0]?.type)) : '#9a9187';
          const item = el('button', { class: `nv-picker-item${i === active ? ' on' : ''}`, style: { '--nc': color } },
            el('span', { class: 'nv-dot' }), el('span', { text: c.def?.title || c.label }), q ? el('small', { text: category }) : null);
          item.addEventListener('mouseenter', () => { active = i; mark(); });
          item.addEventListener('click', () => pick(c));
          listBox.append(item);
        });
        mark();
      }
      function mark() {
        [...listBox.querySelectorAll('.nv-picker-item')].forEach((b, i) => b.classList.toggle('on', i === active));
        const c = shown[active];
        info.textContent = c ? (c.def?.desc || c.desc || '') : 'Nothing matches';
        listBox.querySelectorAll('.nv-picker-item')[active]?.scrollIntoView({ block: 'nearest' });
      }
      function pick(c) {
        closePicker();
        if (c.extra) { c.extra.run?.(at); return; }
        change('add', () => {
          const n = addNode(c.def.type, { x: at.x - (from?.dir === 'in' ? 180 : 0), y: at.y - 14 });
          if (from && c.port) {
            if (from.dir === 'out') connect(from.id, from.port, n.id, c.port, { quiet: true });
            else connect(n.id, c.port, from.id, from.port, { quiet: true });
          }
          sel.clear(); sel.add(n.id); paintSelection(); drawWires();
        });
        root.focus({ preventScroll: true });
      }
      input.addEventListener('input', () => { active = 0; paint(); });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); mark(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
        if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
        if (e.key === 'Escape') { closePicker(); root.focus({ preventScroll: true }); }
      });
      paint();
      input.focus();
    }

    // ---------- clipboard ----------
    function copyOf(ids) {
      const set = new Set(ids);
      return { nodes: graph.nodes.filter((n) => set.has(n.id)).map(clone), links: graph.links.filter((l) => set.has(l.from[0]) && set.has(l.to[0])).map(clone) };
    }
    function pasteData(data, { dx = 40, dy = 40, at = null } = {}) {
      const map = new Map();
      if (!data?.nodes?.length) return map;
      const minX = Math.min(...data.nodes.map((n) => n.x)); const minY = Math.min(...data.nodes.map((n) => n.y));
      sel.clear();
      for (const n of data.nodes) {
        if (!reg.has(n.type)) continue;
        const def = reg.get(n.type);
        const id = reg.idFor(def, graph);
        const x = at ? at.x + (n.x - minX) : n.x + dx; const y = at ? at.y + (n.y - minY) : n.y + dy;
        const copy = { ...clone(n), id, x: snapV(x), y: snapV(y) };
        graph.nodes.push(copy);
        map.set(n.id, id);
        sel.add(id);
      }
      for (const l of data.links || []) if (map.has(l.from[0]) && map.has(l.to[0])) graph.links.push({ from: [map.get(l.from[0]), l.from[1]], to: [map.get(l.to[0]), l.to[1]] });
      renderAll();
      return map;
    }
    function copySel(cut = false) {
      if (!sel.size) return;
      clipboard = copyOf([...sel]);
      try { navigator.clipboard.writeText(JSON.stringify({ hearthNodes: reg.name, ...clipboard })); } catch { /* no clipboard */ }
      if (cut) change('cut', () => removeNodes([...sel]));
    }
    async function paste() {
      let data = clipboard;
      try { const t = await navigator.clipboard.readText(); const j = JSON.parse(t); if (j?.hearthNodes === reg.name || (j?.nodes && j?.links)) data = j; } catch { /* not ours */ }
      if (!data) return;
      const at = lastPointer ? toGraph(lastPointer.cx, lastPointer.cy) : null;
      change('paste', () => pasteData(data, { at }));
    }

    // ---------- frames, notes, rename, colors ----------
    async function renameNode(id) {
      const n = nodeById(id);
      if (!n) return;
      const name = await Modal.prompt('Rename node', { value: n.title || defOf(n).title });
      if (name == null) return;
      change('rename', () => { n.title = name.trim() && name.trim() !== defOf(n).title ? name.trim() : undefined; if (!n.title) delete n.title; renderNode(n); drawWires(); });
    }
    async function renameFrame(f) {
      const name = await Modal.prompt('Group title', { value: f.title || '' });
      if (name == null) return;
      change('frame', () => { f.title = name.trim() || 'Group'; renderFrames(); });
    }
    function frameAround(ids, { title = 'Group', color } = {}) {
      const list = ids.map(nodeById).filter(Boolean);
      if (!list.length) return null;
      const x0 = Math.min(...list.map((n) => n.x)) - 24; const y0 = Math.min(...list.map((n) => n.y)) - 48;
      const x1 = Math.max(...list.map((n) => n.x + (ports.get(n.id)?.w || 180))) + 24; const y1 = Math.max(...list.map((n) => n.y + (ports.get(n.id)?.h || 60))) + 24;
      const f = { id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0, title, color: color || COLORS[graph.frames.length % COLORS.length] };
      graph.frames.push(f);
      renderFrames();
      return f;
    }
    function addNote(text = '', p = null) {
      const at = p || centerGraph();
      const m = { id: `m${Date.now().toString(36)}`, x: snapV(at.x), y: snapV(at.y), w: 200, text };
      graph.notes.push(m);
      renderFrames();
      return m;
    }

    // ---------- layout & view ----------
    function bounds(ids) {
      const list = (ids?.length ? ids.map(nodeById) : graph.nodes).filter(Boolean);
      const boxes = list.map((n) => ({ x: n.x, y: n.y, w: ports.get(n.id)?.w || 180, h: ports.get(n.id)?.h || 60 }));
      if (!ids?.length) for (const f of graph.frames) boxes.push(f);
      if (!ids?.length) for (const m of graph.notes) boxes.push({ x: m.x, y: m.y, w: m.w || 200, h: 80 });
      if (!boxes.length) return null;
      const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
      return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
    }
    function fit(ids, { maxZoom = 1.1, minZoom = 0.15 } = {}) {
      const b = bounds(ids);
      const r = rect();
      if (!b || !r.width) return;
      const z = clamp(Math.min((r.width - 60) / b.w, (r.height - 60) / b.h), minZoom, maxZoom);
      view = { z, x: (r.width - b.w * z) / 2 - b.x * z, y: (r.height - b.h * z) / 2 - b.y * z };
      applyView();
    }
    // Columns by depth (sources left, outputs right); rows ordered by where their inputs come from.
    function layout(ids) {
      const scope = new Set((ids?.length > 1 ? ids : graph.nodes.map((n) => n.id)));
      const list = graph.nodes.filter((n) => scope.has(n.id));
      if (!list.length) return;
      const depth = new Map();
      const dep = (id, seen = new Set()) => {
        if (depth.has(id)) return depth.get(id);
        if (seen.has(id)) return 0;
        seen.add(id);
        const ins = graph.links.filter((l) => l.to[0] === id && scope.has(l.from[0]));
        const d = ins.length ? 1 + Math.max(...ins.map((l) => dep(l.from[0], seen))) : 0;
        depth.set(id, d);
        return d;
      };
      for (const n of list) dep(n.id);
      // pull sources toward the nodes that use them (a node feeding only column 4 sits in column 3)
      for (let pass = 0; pass < 2; pass += 1) {
        for (const n of [...list].sort((a, b) => depth.get(b.id) - depth.get(a.id))) {
          const outsTo = graph.links.filter((l) => l.from[0] === n.id && scope.has(l.to[0]));
          if (outsTo.length) depth.set(n.id, Math.max(depth.get(n.id), Math.min(...outsTo.map((l) => depth.get(l.to[0]))) - 1));
        }
      }
      const cols = [];
      for (const n of list) (cols[depth.get(n.id)] ||= []).push(n);
      const x0 = ids?.length > 1 ? Math.min(...list.map((n) => n.x)) : 0;
      const y0 = ids?.length > 1 ? Math.min(...list.map((n) => n.y)) : 0;
      let x = x0;
      const yOf = new Map();
      cols.forEach((col) => {
        if (!col) return;
        col.forEach((n) => {
          const ins = graph.links.filter((l) => l.to[0] === n.id && yOf.has(l.from[0]));
          n.__k = ins.length ? ins.reduce((s, l) => s + yOf.get(l.from[0]), 0) / ins.length : n.y;
        });
        col.sort((a, b) => a.__k - b.__k);
        let y = y0;
        const w = Math.max(...col.map((n) => ports.get(n.id)?.w || 180));
        for (const n of col) {
          delete n.__k;
          n.x = snapV(x); n.y = snapV(y);
          yOf.set(n.id, n.y + 20);
          y += (ports.get(n.id)?.h || 60) + 28;
        }
        x += w + 70;
      });
      // center each column on the tallest
      const heights = cols.map((col) => (col ? Math.max(...col.map((n) => n.y + (ports.get(n.id)?.h || 60))) - y0 : 0));
      const tall = Math.max(...heights);
      cols.forEach((col, i) => { if (col) for (const n of col) n.y = snapV(n.y + (tall - heights[i]) / 2); });
      renderAll();
    }

    // ---------- search ----------
    let searchHits = []; let searchAt = 0;
    function openSearch() { searchBox.hidden = false; searchBox.value = ''; searchBox.focus(); }
    function runSearch(q, next = false) {
      for (const node of nodeEls.values()) node.classList.remove('hit');
      q = String(q || '').trim().toLowerCase();
      if (!q) { searchHits = []; return []; }
      searchHits = graph.nodes.filter((n) => `${n.title || ''} ${defOf(n)?.title} ${n.type} ${n.id}`.toLowerCase().includes(q)).map((n) => n.id);
      for (const id of searchHits) nodeEls.get(id)?.classList.add('hit');
      if (searchHits.length) { searchAt = next ? (searchAt + 1) % searchHits.length : 0; centerOn(searchHits[searchAt]); }
      return searchHits;
    }
    function centerOn(id) {
      const n = nodeById(id);
      if (!n) return;
      const r = rect();
      view.x = r.width / 2 - (n.x + 90) * view.z; view.y = r.height / 2 - (n.y + 30) * view.z;
      applyView();
    }
    searchBox.addEventListener('input', () => runSearch(searchBox.value));
    searchBox.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); runSearch(searchBox.value, true); if (searchHits.length) { sel.clear(); sel.add(searchHits[searchAt]); paintSelection(); } }
      if (e.key === 'Escape') { searchBox.hidden = true; runSearch(''); root.focus({ preventScroll: true }); }
    });

    // ---------- keyboard ----------
    root.addEventListener('keydown', (e) => {
      if (e.target !== root) return;
      const k = e.key.toLowerCase();
      const C = e.ctrlKey || e.metaKey;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === ' ' && !e.repeat && spacePan) { e.preventDefault(); spaceDown = true; root.classList.add('panning'); }
      if (C && k === 'z' && !e.shiftKey) { stop(); undo(); return; }
      if ((C && k === 'z' && e.shiftKey) || (C && k === 'y')) { stop(); redo(); return; }
      if (C && k === 'f') { stop(); openSearch(); return; }
      if (C && k === 'a') { stop(); for (const n of graph.nodes) sel.add(n.id); paintSelection(); return; }
      // [ / ] select what feeds the selection / what it feeds (both modes)
      if (!C && (e.key === '[' || e.key === ']') && sel.size) { stop(); selectChain(e.key === ']' ? 'down' : 'up'); return; }
      if (ro) {
        if (k === 'f' || e.key === 'Home') { stop(); fit(sel.size ? [...sel] : null); }
        else if (e.key === 'Enter' && sel.size === 1) { stop(); onOpen?.([...sel][0]); }
        else if (e.key === 'Escape') { sel.clear(); paintSelection(); }
        else if (k === 'h' && sel.size) { stop(); for (const id of sel) { const n = nodeById(id); n.collapsed = !n.collapsed; renderNode(n); } paintSelection(); drawWires(); }
        else if (k === '1' || e.key === '=' || e.key === '+' || e.key === '-') { stop(); const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, k === '1' ? 1 : e.key === '-' ? view.z / 1.2 : view.z * 1.2); }
        else if (e.key === '?') { stop(); help(); }
        return;
      }
      if (k === 'm' && sel.size) { stop(); toggleBypass([...sel]); return; }
      if (C && k === 'c') { stop(); copySel(); return; }
      if (C && k === 'x') { stop(); copySel(true); return; }
      if (C && k === 'v') { stop(); paste(); return; }
      if (C && k === 'd') { stop(); if (sel.size) change('duplicate', () => pasteData(copyOf([...sel]), { dx: 32, dy: 32 })); return; }
      if (C && k === 'g') { stop(); if (sel.size) change('frame', () => frameAround([...sel])); return; }
      if (C) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        stop();
        if (sel.size) change('delete', () => removeNodes([...sel]));
        else if (selWire != null) change('disconnect', () => { const l = graph.links[selWire]; graph.links.splice(selWire, 1); selWire = null; const n = nodeById(l?.to[0]); if (n) renderNode(n); drawWires(); });
        else if (selFrame) change('frame', () => { graph.frames = graph.frames.filter((f) => f.id !== selFrame); selFrame = null; renderFrames(); });
        return;
      }
      if (e.key === 'Tab' || (k === 'a' && e.shiftKey)) { stop(); openPicker(); return; }
      if (e.key === 'Escape') { sel.clear(); selWire = null; selFrame = null; paintSelection(); drawWires(); renderFrames(); return; }
      if (k === 'f' || e.key === 'Home') { stop(); fit(sel.size ? [...sel] : null); return; }
      if (k === 'l') { stop(); change('layout', () => layout([...sel])); return; }
      if (k === 'h') { stop(); if (sel.size) change('collapse', () => { const all = [...sel].map(nodeById).every((n) => n.collapsed); for (const id of sel) { const n = nodeById(id); n.collapsed = !all; renderNode(n); } paintSelection(); drawWires(); }); return; }
      if (k === 'c' && !e.shiftKey) { stop(); const p = lastPointer ? toGraph(lastPointer.cx, lastPointer.cy) : null; change('note', () => addNote('', p)); return; }
      if (k === '1') { stop(); const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1); return; }
      if (e.key === '=' || e.key === '+') { stop(); const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.z * 1.2); return; }
      if (e.key === '-') { stop(); const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.z / 1.2); return; }
      if (e.key.startsWith('Arrow') && sel.size) {
        stop();
        const s = e.shiftKey ? GRID * 4 : GRID;
        const [dx, dy] = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        change('move', () => { for (const id of sel) { const n = nodeById(id); n.x += dx; n.y += dy; const node = nodeEls.get(id); node.style.left = `${n.x}px`; node.style.top = `${n.y}px`; } drawWires(); });
        return;
      }
      if (e.key === '?') { stop(); help(); }
    });
    root.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; root.classList.remove('panning'); } });
    root.addEventListener('blur', () => { spaceDown = false; root.classList.remove('panning'); });

    function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); graph = JSON.parse(undoStack.pop()); renderAll(); onChange?.(clone(graph), { kind: 'undo' }); }
    function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); graph = JSON.parse(redoStack.pop()); renderAll(); onChange?.(clone(graph), { kind: 'redo' }); }
    function help() {
      const rows = [['Drag a dot', 'Connect (drop on empty space to pick a node)'], ['Tab · Shift+A · double-click', 'Add a node'], ['Drag background', 'Box select (Shift adds)'], [spacePan ? 'Right/middle drag · Space+drag' : 'Right/middle drag', 'Pan'], ['Wheel · pinch', 'Zoom'],
        ['Ctrl+C / X / V / D', 'Copy · cut · paste · duplicate'], ['Alt+drag', 'Duplicate while moving'], ['Delete', 'Delete the selection or wire'], ['Ctrl+Z · Ctrl+Shift+Z', 'Undo · redo'], ['Ctrl+G', 'Group into a frame'],
        ['C', 'Note'], ['H', 'Collapse'], ['M', 'Bypass (skip) the selected nodes'], ['[ · ]', 'Select what feeds it · what it feeds'], ['L', 'Auto layout'], ['F · Home', 'Fit'], ['1 · + · −', 'Zoom 100% · in · out'], ['Ctrl+F', 'Find a node'], ['Alt+click a wire', 'Reroute dot'], ['Double-click a title', 'Rename'], ['Hover a node', 'Light up its wires'], ['Right-click', 'Menus']];
      const roRows = [['Drag a node', roMove ? 'Arrange (the content stays read-only)' : 'Select'], ['Double-click · Enter', onOpen ? 'Open what the node stands for' : 'Select'], ['[ · ]', 'Select what feeds it · what it feeds'], ['H', 'Collapse'], ['F · Home', 'Fit'], ['Right/middle drag', 'Pan'], ['Wheel · pinch', 'Zoom'], ['Ctrl+F', 'Find a node'], ['Hover a node', 'Light up its wires']];
      menu(rect().left + 20, rect().top + 44, [ro ? 'Keys (read-only graph)' : 'Node keys', ...(ro ? roRows : rows).map(([k, v]) => [v, '', null, { key: k }])]);
    }
    // ---------- bypass, chains ----------
    function toggleBypass(ids) {
      change('bypass', () => {
        const all = ids.map(nodeById).filter((n) => n && n.type !== '@reroute');
        const on = !all.every((n) => n.bypass);
        for (const n of all) { if (on) n.bypass = true; else delete n.bypass; renderNode(n); }
        paintSelection(); drawWires();
      });
    }
    // everything upstream (what feeds the selection) or downstream (what it feeds)
    function chainOf(ids, dir) {
      const seen = new Set(ids); const stack = [...ids];
      while (stack.length) {
        const id = stack.pop();
        for (const l of graph.links) {
          const next = dir === 'down' ? (l.from[0] === id ? l.to[0] : null) : (l.to[0] === id ? l.from[0] : null);
          if (next && !seen.has(next)) { seen.add(next); stack.push(next); }
        }
      }
      return [...seen];
    }
    function selectChain(dir) { const ids = chainOf([...sel], dir); sel.clear(); for (const id of ids) sel.add(id); paintSelection(); }

    // ---------- menus ----------
    function contextMenu(e) {
      const nodeEl = e.target.closest('.nv-node');
      const linkEl = e.target.closest('.nv-link');
      const frameEl = e.target.closest('.nv-frame');
      const w = e.target.closest('.nv-widget');
      const at = toGraph(e.clientX, e.clientY);
      if (w && !ro) {
        const n = nodeById(w.dataset.node); const f = fieldsOf(n).find((x) => x.name === w.dataset.field);
        const on = n.sliders?.[f.name] ?? f.slider ?? defOf(n).sliders ?? true;
        const items = [`${f.label}`];
        if (reg.sliderLabel && ['number', 'knob', 'color', 'toggle', 'select'].includes(f.kind)) items.push([reg.sliderLabel, reg.sliderHint || '', () => change('slider', () => { n.sliders = { ...(n.sliders || {}), [f.name]: !on }; renderNode(n); }), { checked: on }]);
        items.push(['Reset to default', '', () => setValue(n, f, clone(f.value)) || renderNode(n)]);
        if (f.min != null && f.max != null) items.push(['Random value', '', () => { const v = f.min + Math.random() * (f.max - f.min); setValue(n, f, f.step ? Math.round(v / f.step) * f.step : Math.round(v * 1000) / 1000); renderNode(n); }]);
        menu(e.clientX, e.clientY, items);
        return;
      }
      if (nodeEl && !ro) {
        const id = nodeEl.dataset.id;
        if (!sel.has(id)) { sel.clear(); sel.add(id); paintSelection(); }
        const n = nodeById(id);
        const def = defOf(n);
        menu(e.clientX, e.clientY, [
          def.title,
          ['Rename…', '', () => renameNode(id), { key: 'dbl-click' }],
          ['Duplicate', '', () => change('duplicate', () => pasteData(copyOf([...sel]), { dx: 32, dy: 32 })), { key: 'Ctrl+D' }],
          ['Collapse', '', () => change('collapse', () => { for (const x of sel) { const m = nodeById(x); m.collapsed = !m.collapsed; renderNode(m); } drawWires(); }), { key: 'H', checked: n.collapsed }],
          ['Group into a frame', '', () => change('frame', () => frameAround([...sel])), { key: 'Ctrl+G' }],
          ['Color', '', () => menu(e.clientX, e.clientY, ['Node color', ...COLORS.map((c) => [c, '', () => change('color', () => { for (const x of sel) { const m = nodeById(x); m.color = c; renderNode(m); } })]), ['Default', '', () => change('color', () => { for (const x of sel) { const m = nodeById(x); delete m.color; renderNode(m); } })]])],
          reg.sliderLabel ? ['All sliders on / off', 'Show every knob of this node as a slider, or none', () => change('slider', () => { const on = !def.fields.some((f) => n.sliders?.[f.name] ?? f.slider ?? def.sliders ?? true); n.sliders = Object.fromEntries(def.fields.filter((f) => f.kind).map((f) => [f.name, on])); renderNode(n); })] : null,
          reg.bypass !== false && def.inputs.length ? ['Bypass (skip)', 'Its input passes straight through; nothing of its own runs', () => toggleBypass([...sel]), { key: 'M', checked: Boolean(n.bypass) }] : null,
          ['Select what feeds it', '', () => selectChain('up'), { key: '[' }],
          ['Select what it feeds', '', () => selectChain('down'), { key: ']' }],
          ['Disconnect all', '', () => change('disconnect', () => { graph.links = graph.links.filter((l) => l.from[0] !== id && l.to[0] !== id); renderAll(); })],
          def.desc ? ['What it does', def.desc, () => toast(`${def.title}: ${def.desc}`, { timeout: 6000 })] : null,
          ...(nodeMenu?.(clone(n), api) || []),
          '-',
          ['Delete', '', () => change('delete', () => removeNodes([...sel])), { key: 'Del' }],
        ]);
        return;
      }
      // read-only graphs: look around (open, select chains, collapse) and the adapter's own items
      if (nodeEl && ro) {
        const id = nodeEl.dataset.id;
        if (!sel.has(id)) { sel.clear(); sel.add(id); paintSelection(); }
        const n = nodeById(id);
        const def = defOf(n);
        menu(e.clientX, e.clientY, [
          n.title || def.title,
          onOpen ? ['Open', '', () => onOpen(id), { key: 'Enter' }] : null,
          ['Select what feeds it', '', () => selectChain('up'), { key: '[' }],
          ['Select what it feeds', '', () => selectChain('down'), { key: ']' }],
          ['Collapse', '', () => { for (const x of sel) { const m = nodeById(x); m.collapsed = !m.collapsed; renderNode(m); } drawWires(); }, { key: 'H', checked: n.collapsed }],
          ['Fit the selection', '', () => fit([...sel]), { key: 'F' }],
          ...(nodeMenu?.(clone(n), api) || []),
        ]);
        return;
      }
      if (linkEl && !ro) {
        const i = Number(linkEl.dataset.link);
        menu(e.clientX, e.clientY, ['Wire', ['Add a reroute dot', '', () => insertReroute(i, at), { key: 'Alt+click' }], ['Delete the wire', '', () => change('disconnect', () => { const l = graph.links[i]; graph.links.splice(i, 1); const n = nodeById(l?.to[0]); if (n) renderNode(n); drawWires(); })]]);
        return;
      }
      if (frameEl && !ro) {
        const f = graph.frames.find((x) => x.id === frameEl.dataset.frame);
        menu(e.clientX, e.clientY, ['Frame', ['Rename…', '', () => renameFrame(f)], ['Color', '', () => menu(e.clientX, e.clientY, COLORS.map((c) => [c, '', () => change('frame', () => { f.color = c; renderFrames(); })]))],
          ['Delete the frame (keep nodes)', '', () => change('frame', () => { graph.frames = graph.frames.filter((x) => x !== f); renderFrames(); })]]);
        return;
      }
      menu(e.clientX, e.clientY, [
        ro ? null : ['Add a node…', '', () => openPicker({ cx: e.clientX, cy: e.clientY }), { key: 'Tab' }],
        ro ? null : ['Paste', '', () => paste(), { key: 'Ctrl+V', disabled: !clipboard }],
        ro ? null : ['Note here', '', () => change('note', () => addNote('', at)), { key: 'C' }],
        ...viewItems(),
      ]);
    }
    function viewItems() {
      return [
        'View',
        ro ? null : ['Auto layout', 'Columns from inputs to outputs', () => change('layout', () => layout([...sel])), { key: 'L' }],
        ['Fit everything', '', () => fit(), { key: 'F' }],
        ['Find a node…', '', () => openSearch(), { key: 'Ctrl+F' }],
        ['Snap to grid', '', () => { snap = !snap; store.set(`${storeKey}.snap`, snap); }, { checked: snap }],
        ['Minimap', '', () => { showMini = !showMini; store.set(`${storeKey}.minimap`, showMini); mini.hidden = !showMini; drawMiniSoon(); }, { checked: showMini }],
        ['Flowing wires', 'Animate wires that carry live values (music, time, sliders)', () => { live = !live; drawWires(); }, { checked: live }],
        ro ? null : '-',
        ro ? null : ['Undo', '', () => undo(), { key: 'Ctrl+Z', disabled: !undoStack.length }],
        ro ? null : ['Redo', '', () => redo(), { key: 'Ctrl+Shift+Z', disabled: !redoStack.length }],
        ['Keys…', '', () => help(), { key: '?' }],
      ];
    }
    addBtn.addEventListener('click', () => { const r = addBtn.getBoundingClientRect(); openPicker({ cx: r.left, cy: r.bottom + 6 }); });
    moreBtn.addEventListener('click', () => {
      const r = moreBtn.getBoundingClientRect();
      menu(r.left, r.bottom + 4, [
        ...(menuItems?.() || []),
        ro ? null : 'Add',
        ro ? null : ['Frame around the selection', 'Group nodes under a title and color', () => change('frame', () => frameAround(sel.size ? [...sel] : graph.nodes.map((n) => n.id))), { key: 'Ctrl+G' }],
        ro ? null : ['Note', '', () => change('note', () => addNote('')), { key: 'C' }],
        ...viewItems(),
      ]);
    });
    zoomLbl.addEventListener('click', (e) => { if (e.detail === 2) { fit(); return; } const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1); });

    // ---------- minimap ----------
    let miniQueued = false;
    function drawMiniSoon() { if (miniQueued || mini.hidden) return; miniQueued = true; requestAnimationFrame(() => { miniQueued = false; drawMini(); }); }
    let miniMap = null;
    function drawMini() {
      const g = mini.getContext('2d');
      const W = mini.width; const H = mini.height;
      g.clearRect(0, 0, W, H);
      const b = bounds(null);
      const r = rect();
      if (!b) return;
      const vx = -view.x / view.z; const vy = -view.y / view.z; const vw = r.width / view.z; const vh = r.height / view.z;
      const x0 = Math.min(b.x, vx) - 40; const y0 = Math.min(b.y, vy) - 40;
      const x1 = Math.max(b.x + b.w, vx + vw) + 40; const y1 = Math.max(b.y + b.h, vy + vh) + 40;
      const s = Math.min(W / (x1 - x0), H / (y1 - y0));
      miniMap = { x0, y0, s };
      const cs = getComputedStyle(root);
      for (const f of graph.frames) { g.fillStyle = `${f.color || COLORS[0]}22`; g.fillRect((f.x - x0) * s, (f.y - y0) * s, f.w * s, f.h * s); }
      for (const n of graph.nodes) {
        const def = defOf(n);
        g.fillStyle = sel.has(n.id) ? '#ffffff' : (n.color || def?.color || reg.typeColor(def?.outputs[0]?.type));
        const P = ports.get(n.id) || { w: 180, h: 60 };
        g.fillRect((n.x - x0) * s, (n.y - y0) * s, Math.max(2, (P.w || 8) * s), Math.max(2, (n.collapsed ? 28 : P.h || 8) * s));
      }
      g.strokeStyle = cs.getPropertyValue('--accent').trim() || '#ffd75e';
      g.lineWidth = 1.5;
      g.strokeRect((vx - x0) * s, (vy - y0) * s, vw * s, vh * s);
    }
    const miniJump = (e) => {
      if (!miniMap) return;
      const mr = mini.getBoundingClientRect(); const r = rect();
      const gx = (e.clientX - mr.left) / miniMap.s + miniMap.x0; const gy = (e.clientY - mr.top) / miniMap.s + miniMap.y0;
      view.x = r.width / 2 - gx * view.z; view.y = r.height / 2 - gy * view.z;
      applyView();
    };
    mini.addEventListener('pointerdown', (e) => { e.stopPropagation(); capture(mini, e); miniJump(e); const mv = (ev) => miniJump(ev); mini.addEventListener('pointermove', mv); mini.addEventListener('pointerup', () => mini.removeEventListener('pointermove', mv), { once: true }); });
    const ro2 = new ResizeObserver(() => drawMiniSoon());
    ro2.observe(root);

    // ---------- live values ----------
    let liveVals = {};
    function setLive(values = {}) {
      liveVals = values;
      for (const s of root.querySelectorAll('.nv-live')) {
        const v = values[s.dataset.k];
        if (v === undefined) { if (s.textContent) { s.textContent = ''; s.style.removeProperty('--lv'); } continue; }
        s.textContent = fmt(v);
        if (isNum(v)) s.style.setProperty('--lv', `${clamp(Math.abs(v), 0, 1) * 100}%`);
      }
    }

    applyView();
    renderAll();
    requestAnimationFrame(() => { if (graph.nodes.length) fit(null, { maxZoom: 1, minZoom: 0.5 }); });

    const api = {
      el: root, registry: reg,
      getGraph: () => clone(graph),
      setGraph(g, { keepView = false, history = true } = {}) {
        if (history) { undoStack.push(snapshot()); redoStack.length = 0; }
        graph = normalize(g, reg);
        sel.clear(); selWire = null; selFrame = null;
        renderAll();
        if (!keepView) requestAnimationFrame(() => fit(null, { maxZoom: 1, minZoom: 0.5 }));
      },
      // programmatic edits (each is one undo step and calls onChange)
      addNode: (type, o) => { let n; change('add', () => { n = addNode(type, o); drawWires(); }); return n.id; },
      connect: (a, ap, b, bp) => { let ok = false; change('connect', () => { ok = connect(a, ap, b, bp, { quiet: true }); drawWires(); }); return ok; },
      disconnect: (id, port) => change('disconnect', () => { graph.links = graph.links.filter((l) => !(l.to[0] === id && (port == null || l.to[1] === port))); renderAll(); }),
      removeNodes: (ids) => change('delete', () => { removeNodes(ids); drawWires(); }),
      setValue: (id, name, v) => { const n = nodeById(id); const f = n && fieldsOf(n).find((x) => x.name === name); if (!f) return false; setValue(n, f, v); renderNode(n); drawWires(); return true; },
      setTitle: (id, title) => change('rename', () => { const n = nodeById(id); if (n) { n.title = title || undefined; renderNode(n); } }),
      select: (ids) => { sel.clear(); for (const id of ids || []) sel.add(id); paintSelection(); },
      selection: () => [...sel],
      layout: (ids) => change('layout', () => layout(ids)),
      fit: (ids) => fit(ids),
      center: (id) => centerOn(id),
      zoom: (z) => { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, z); },
      undo, redo,
      frame: (ids, o) => { let f; change('frame', () => { f = frameAround(ids, o); }); return f?.id; },
      note: (text, p) => { let m; change('note', () => { m = addNote(text, p); }); return m.id; },
      openPicker: (o) => openPicker(o || {}),
      search: (q) => runSearch(q),
      setLive,
      // which outputs carry changing values (from the last compile): their wires flow
      setDynamic: (set) => { dynamic = new Set(set || []); drawWires(); },
      setErrors: (list = []) => { errorsBy = new Map(list.filter((x) => x.node).map((x) => [x.node, x.message])); for (const [id, node] of nodeEls) { node.classList.toggle('err', errorsBy.has(id)); node.title = errorsBy.get(id) || ''; } },
      setStatus: (text, kind = '') => { status.textContent = text || ''; status.className = `nv-status ${kind}`; },
      setReadOnly: (on) => { ro = Boolean(on); root.classList.toggle('ro', ro); roPill.hidden = !ro; renderAll(); },
      get readOnly() { return ro; },
      compile: (o) => reg.compile(graph, o),
      relayout: () => { for (const id of nodeEls.keys()) measure(id); drawWires(); drawMiniSoon(); },
      focus: () => root.focus({ preventScroll: true }),
      get view() { return { ...view }; },
      // run status of steps (adapters that run graphs): state = queued | running | ok | warn | error | skip | wait,
      // text = the tooltip and the line under the node, pct = 0..1 progress while running
      setRun(id, state, text = '', pct = null) {
        if (!state) runState.delete(id); else runState.set(id, { state, text, pct });
        paintRun(id);
        drawWiresSoon();
      },
      setProgress(id, pct) { const r = runState.get(id); if (r) { r.pct = pct; paintRun(id); } },
      runOf: (id) => (runState.get(id) ? { ...runState.get(id) } : null),
      clearRun() { const ids = [...runState.keys()]; runState.clear(); for (const id of ids) paintRun(id); drawWiresSoon(); },
      setBadge: (id, text) => { const n = nodeById(id); if (n) { if (text) n.badge = text; else delete n.badge; renderNode(n); drawWires(); } },
      bypass: (ids, on) => { const list = (ids || []).map(nodeById).filter(Boolean); if (on != null && list.every((n) => Boolean(n.bypass) === on)) return; toggleBypass(list.map((n) => n.id)); },
      chain: (ids, dir = 'down') => chainOf(ids, dir),
      hudButton: (i) => extraBtns[i] || null,
      destroy: () => { ro2.disconnect(); closePicker(); root.remove(); },
    };
    root.classList.toggle('ro', ro);
    roPill.hidden = !ro;
    return api;
  }

  // ---------- read-only graph in a dialog ----------
  // One searchable picker for any adapter's presets: items [{ id, name, desc, hint (the chat command), tag }].
  // Arrow keys move, Enter picks, typing filters (names, descriptions, tags).
  function presetPicker({ title = 'Presets', items = [], onPick, placeholder } = {}) {
    const q = el('input', { class: 'tn-preset-q', type: 'search', placeholder: placeholder || `Find a preset (${items.length})…`, spellcheck: false });
    const grid = el('div', { class: 'tn-presets' });
    let shown = []; let active = 0;
    const pick = (p) => { d.close(); try { onPick?.(p); } catch (err) { toast(err.message, { type: 'error' }); } };
    const paint = () => {
      const s = q.value.trim().toLowerCase();
      shown = items.filter((p) => !s || s.split(/\s+/).every((w) => `${p.id} ${p.name} ${p.desc || ''} ${p.tags || ''} ${p.tag || ''}`.toLowerCase().includes(w)));
      active = clamp(active, 0, Math.max(0, shown.length - 1));
      grid.replaceChildren(...shown.map((p, i) => el('button', { class: `tn-preset${i === active ? ' on' : ''}`, on: { click: () => pick(p), mouseenter: () => { active = i; mark(); } } },
        el('b', { text: p.name }), p.tag ? el('em', { class: 'tn-preset-tag', text: p.tag }) : null, el('span', { text: p.desc || '' }), p.hint ? el('small', { text: p.hint }) : null)));
      if (!shown.length) grid.append(el('div', { class: 'tn-preset-none', text: 'Nothing matches' }));
    };
    const mark = () => { [...grid.querySelectorAll('.tn-preset')].forEach((b, i) => b.classList.toggle('on', i === active)); grid.querySelectorAll('.tn-preset')[active]?.scrollIntoView({ block: 'nearest' }); };
    q.addEventListener('input', () => { active = 0; paint(); });
    q.addEventListener('keydown', (e) => {
      const cols = Math.max(1, Math.round(grid.clientWidth / 200));
      const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (mv) { e.preventDefault(); active = clamp(active + mv, 0, shown.length - 1); mark(); }
      if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
    });
    const d = el('dialog', { class: 'nv-dialog nv-presets-dialog' },
      el('div', { class: 'nv-dialog-head' }, el('b', { text: title }), el('span', { class: 'nv-dialog-note', text: `${items.length} · ↑↓ Enter` }), el('span', { class: 'spacer' }), el('button', { class: 'ghost small', text: '✕', on: { click: () => d.close() } })),
      el('div', { class: 'nv-presets-body' }, q, grid));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    paint();
    q.focus();
    return { close: () => d.close() };
  }

  // side: an element shown at the right (details of the selected node); other options go to create()
  // (onSelect, onOpen, nodeMenu, hud, menuItems, roMove, readOnly…). actions: [{ label, title, run, primary, close }].
  function showGraph(graph, reg, { title = 'Nodes', note = '', actions = [], side = null, readOnly = true, className = '', onClose, ...opts } = {}) {
    const host = el('div', { class: 'nv-dialog-host' });
    const body = el('div', { class: `nv-dialog-body${side ? ' with-side' : ''}` }, host, side);
    const d = el('dialog', { class: `nv-dialog ${className}` },
      el('div', { class: 'nv-dialog-head' }, el('b', { text: title }), note ? el('span', { class: 'nv-dialog-note', text: note }) : null, el('span', { class: 'spacer' }),
        ...actions.filter(Boolean).map((a) => el('button', { class: a.primary ? 'primary small' : 'ghost small', text: a.label, title: a.title || '', on: { click: () => { a.run(v); if (a.close !== false) d.close(); } } })),
        el('button', { class: 'ghost small', text: '✕', title: 'Close (Esc)', on: { click: () => d.close() } })),
      body);
    d.addEventListener('close', () => { onClose?.(); v.destroy(); d.remove(); });
    document.body.append(d);
    d.showModal();
    const v = create(host, { registry: reg, graph, readOnly, storeKey: 'nodes.dialog', ...opts });
    requestAnimationFrame(() => v.fit());
    return { view: v, close: () => d.close(), dialog: d };
  }

  // ---------- outline of any JS: imports, functions, names, sliders, and what uses what ----------
  let outlineReg = null;
  function outlineRegistry() {
    if (outlineReg) return outlineReg;
    const r = createRegistry({ name: 'outline', types: { ref: { color: '#9a9187', label: 'Used by' } } });
    const kinds = [['import', 'Import', '#7ad0ff'], ['function', 'Function', '#48ddff'], ['class', 'Class', '#bd8bff'], ['value', 'Value', '#ffd75e'], ['sliders', 'Sliders', '#ff8c42'], ['music', 'Music', '#ff6b9d'], ['loop', 'Every frame', '#7cd992'], ['section', 'Section', '#c9b79c']];
    for (const [type, title, color] of kinds) r.define({ type: `o-${type}`, title, category: 'Outline', color, inputs: [{ name: 'uses', type: 'ref', multi: true, label: 'uses' }], outputs: [{ name: 'out', type: 'ref', label: 'used by' }], widgets: [{ name: 'text', kind: 'code', value: '', rows: 3 }] });
    outlineReg = r;
    return r;
  }
  // Best effort (regex, not a parser): good enough to see the shape of a sketch at a glance.
  function outline(code) {
    const src = String(code || '');
    const lines = src.split('\n');
    const items = [];
    const add = (kind, name, text, line) => items.push({ kind, name, text: text.trim().slice(0, 160), line });
    lines.forEach((ln, i) => {
      let m;
      if ((m = ln.match(/^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]/))) add('import', m[2].split('/').pop(), ln, i);
      else if ((m = ln.match(/^\s{0,2}(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/))) add('function', m[1], ln, i);
      else if ((m = ln.match(/^\s{0,2}class\s+([\w$]+)/))) add('class', m[1], ln, i);
      else if ((m = ln.match(/^\s{0,2}(?:const|let|var)\s+([\w$]+)\s*=\s*tweak\(/))) add('sliders', m[1], ln, i);
      else if ((m = ln.match(/^\s{0,2}(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(?[\w$,\s]*\)?\s*=>/))) add('function', m[1], ln, i);
      else if ((m = ln.match(/^\s{0,2}(?:const|let|var)\s+([\w$]+)\s*=/))) add('value', m[1], ln, i);
      else if ((m = ln.match(/^\s*(?:renderer\.setAnimationLoop|requestAnimationFrame)\s*\(/))) add('loop', 'every frame', ln, i);
      else if ((m = ln.match(/^\s*\/\/\s*[-=#*]{2,}\s*(.+?)\s*[-=#*]*\s*$/))) add('section', m[1], ln, i);
    });
    // the code that belongs to each item: until the next item (so references can be found)
    items.forEach((it, k) => { it.body = lines.slice(it.line, items[k + 1]?.line ?? lines.length).join('\n'); });
    const audioUses = [...new Set([...src.matchAll(/\baudio\.(\w+)/g)].map((m) => m[1]))];
    const reg = outlineRegistry();
    const graph = emptyGraph('outline');
    const ids = new Map();
    items.slice(0, 160).forEach((it, k) => {
      const id = `${slug(it.name)}${k}`;
      ids.set(it.name, ids.get(it.name) || id);
      const sliders = it.kind === 'sliders' ? [...it.body.matchAll(/^\s*([\w$]+)\s*:/gm)].map((m) => m[1]).slice(0, 30).join(', ') : '';
      graph.nodes.push({ id, type: `o-${it.kind}`, x: 0, y: k * 10, title: `${it.name} · line ${it.line + 1}`, values: { text: sliders ? `sliders: ${sliders}` : it.text } });
      it.id = id;
    });
    if (audioUses.length) graph.nodes.push({ id: 'music0', type: 'o-music', x: 0, y: 0, title: 'Music', values: { text: `audio.${audioUses.join(', audio.')}` } });
    for (const it of items) {
      if (!it.id) continue;
      for (const other of items) {
        if (other === it || !other.id || other.kind === 'section' || other.kind === 'loop' || (other.name.length < 2 && other.kind === 'value')) continue;
        // its code without its own declared name
        const own = it.kind === 'loop' || it.kind === 'section' ? it.body : it.body.replace(new RegExp(`\\b${it.name.replace(/\$/g, '\\$')}\\b`), '');
        if (new RegExp(`\\b${other.name.replace(/\$/g, '\\$')}\\b`).test(own)) graph.links.push({ from: [other.id, 'out'], to: [it.id, 'uses'] });
      }
      if (audioUses.length && /\baudio\./.test(it.body)) graph.links.push({ from: ['music0', 'out'], to: [it.id, 'uses'] });
    }
    return { graph: normalize(graph, reg), registry: reg, items };
  }
  // A quick layered layout without a view (for graphs built in code: presets, outlines, chat).
  function autoLayout(graph, reg, { colW = 250, rowGap = 26, heightOf } = {}) {
    const H = heightOf || ((n) => { const d = reg?.get(n.type); return d ? 40 + (d.outputs.length + d.fields.length) * 24 : 80; });
    const depth = new Map();
    const dep = (id, seen = new Set()) => {
      if (depth.has(id)) return depth.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      const ins = graph.links.filter((l) => l.to[0] === id);
      const d = ins.length ? 1 + Math.max(...ins.map((l) => dep(l.from[0], seen))) : 0;
      depth.set(id, d);
      return d;
    };
    for (const n of graph.nodes) dep(n.id);
    for (let pass = 0; pass < 2; pass += 1) for (const n of [...graph.nodes].sort((a, b) => depth.get(b.id) - depth.get(a.id))) {
      const o = graph.links.filter((l) => l.from[0] === n.id);
      if (o.length) depth.set(n.id, Math.max(depth.get(n.id), Math.min(...o.map((l) => depth.get(l.to[0]))) - 1));
    }
    const cols = [];
    for (const n of graph.nodes) (cols[depth.get(n.id)] ||= []).push(n);
    const yOf = new Map();
    const heights = [];
    cols.forEach((col, c) => {
      if (!col) return;
      col.forEach((n) => { const ins = graph.links.filter((l) => l.to[0] === n.id && yOf.has(l.from[0])); n.__k = ins.length ? ins.reduce((s, l) => s + yOf.get(l.from[0]), 0) / ins.length : n.y; });
      col.sort((a, b) => a.__k - b.__k);
      let y = 0;
      for (const n of col) { delete n.__k; n.x = c * colW; n.y = y; yOf.set(n.id, y); y += H(n) + rowGap; }
      heights[c] = y;
    });
    const tall = Math.max(0, ...heights.filter(Boolean));
    cols.forEach((col, c) => { if (col) for (const n of col) n.y = Math.round((n.y + (tall - heights[c]) / 2) / GRID) * GRID; });
    return graph;
  }

  // ---------- adapters + the global entry point other tools call ----------
  const adapters = [];
  // { id, label, kinds: ['three'], detect(code, lang) → bool, open(code, lang, graph|null) }
  function registerAdapter(a) { const i = adapters.findIndex((x) => x.id === a.id); if (i >= 0) adapters.splice(i, 1, a); else adapters.push(a); }
  // Open code in a node view: a graph embedded in it opens in its adapter; otherwise an adapter that knows
  // the code (a three.js sketch) opens it; otherwise a read-only outline.
  function openCode(code, lang = '') {
    const hit = extract(code);
    if (hit) {
      const a = ranked().find((x) => x.kinds?.includes(hit.graph.kind)) || ranked().find((x) => x.detect?.(code, lang));
      if (a) return guard(a.open(code, lang, hit.graph));
    } else {
      const a = ranked().find((x) => x.detect?.(code, lang));
      if (a) return guard(a.open(code, lang, null));
    }
    const o = outline(code);
    if (!o.graph.nodes.length) { toast('Nothing to show as nodes in this code', { timeout: 2000 }); return null; }
    autoLayout(o.graph, o.registry, { colW: 280 });
    return showGraph(o.graph, o.registry, { title: 'Code outline', note: `${lang || 'code'} · read-only: what uses what` });
  }
  // adapters with a higher priority are asked first (a catch-all like the code flow view uses a low one)
  const ranked = () => adapters.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const guard = (r) => { if (r && typeof r.then === 'function') r.catch((err) => toast(`Couldn't open it as nodes: ${err.message}`, { type: 'error' })); return r; };

  const api = { createRegistry, create, compileGraph, normalize, compact, embed, extract, emptyGraph, autoLayout, outline, outlineRegistry, showGraph, presetPicker, menu, registerAdapter, adapters: () => adapters.slice(), openCode, EASES, COLORS, slug, fmt };
  // other scripts reach it as window.NodeView (a top-level const is not a window property): the chat's code
  // blocks show their "Nodes" button and /code n nodes only when it's there
  if (typeof window !== 'undefined') window.NodeView = api;
  return api;
})();
