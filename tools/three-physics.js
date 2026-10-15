// ⚛ Light physics (round 25, physics): physics layers in the Lab, the hub side.
// - A ⚛ layer is plain layer code calling physics(P, opts) (simulated and drawn by tools/three-sandbox.html "light
//   physics": a compact position-based solver for rigid boxes / letters / dominoes / model hulls, balls, ragdolls,
//   cloth, ropes, jelly and water, 60 fixed steps a second of the scene's clock, cached states for scrubbing, sleeping
//   bodies, instanced drawing). Its sliders are a normal tweak(): Save, Shuffle, looks, keyframes and ♪ react-to work.
// - Presets (tools/three-physics-data.js): one searchable picker (/physics, right-click the preview › ＋ Add › ⚛ Physics,
//   Ctrl/⌘+K, the FX picker's "Physics" category, /template physics-<id>).
// - Edits go through the layer's code (undoable, the time machine sees them): a slider's value, a slider added, the
//   options (build, text, source, bodies…). Kick / drop / reset now are live pokes (not on the timeline).
// - Chat: /physics (<preset> · list · text · model · set · add · kick · drop · reset · react · info · help).
//   Directors: three_do physics { op } (list · add · set · body · poke · react · info · help), lean: explained on
//   demand by three_do help physics (one short entry in three_do's description, nothing in the prompt).
const LabPhysics = (() => {
  const PD = PhysicsData;
  const info = new Map(); // layer id → the page's last physics-info
  const D = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director : null);
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const fmtNum = (n) => { const x = Math.round(Number(n) * 10000) / 10000; return Number.isFinite(x) ? String(x) : '0'; };
  const lit = (v) => (typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? String(v) : q(v));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const CALL = /(^|[^.\w$])physics\s*\(\s*P\s*[,)]/m;
  const isPhysics = (code) => CALL.test(String(code || ''));

  // ---------- presets → layer code ----------
  function preset(q0) {
    const w = norm(q0);
    if (!w) return null;
    const L = PD.PRESETS;
    return L.find((p) => p.id === q0 || norm(p.id) === w || norm(p.name) === w) || L.find((p) => norm(p.name).startsWith(w) || norm(p.id).startsWith(w)) || L.find((p) => norm(`${p.name} ${p.cat} ${p.desc} ${p.opts.build}`).includes(w)) || null;
  }
  function sliderLine(key, value) {
    const s = PD.SLIDERS[key];
    const v = value === undefined ? s.value : value;
    const parts = [`value: ${lit(v)}`];
    if (s.options) parts.push(`options: [${s.options.map(q).join(', ')}]`);
    if (s.min != null) parts.push(`min: ${fmtNum(s.min)}`, `max: ${fmtNum(s.max)}`);
    if (s.step) parts.push(`step: ${fmtNum(s.step)}`);
    parts.push(`label: ${q(s.label)}`, `group: ${q(s.group)}`);
    if (s.hint) parts.push(`hint: ${q(s.hint)}`);
    return `  ${key}: { ${parts.join(', ')} },`;
  }
  // { preset, name, sliders: { key: value } (on top of the preset's), opts: { … } (on top of the preset's) }
  function codeFor(p, { name = null, sliders = {}, opts = {} } = {}) {
    const vals = { ...p.sliders, ...sliders };
    const o = { ...p.opts, ...opts };
    const keys = [...new Set([...PD.BASE, ...Object.keys(vals)])].filter((k) => PD.SLIDERS[k]);
    for (const [k, v] of Object.entries(vals)) if (!PD.SLIDERS[k]) o[k] = v;
    const groups = [...new Set(keys.map((k) => PD.SLIDERS[k].group))];
    const lines = [
      `// ⚛ Physics: ${name || p.name} (preset ${p.id}) · light physics: /physics, three_do physics.`,
      '// The sliders are live (♪ react-to, keyframes, Shuffle; Bodies and Size rebuild); the options pick the scene:',
      `// build ${PD.BUILDS.join(' | ')} · bodies [{type, at, size}] · /physics help`,
      'const P = tweak({',
      ...groups.flatMap((g) => keys.filter((k) => PD.SLIDERS[k].group === g).map((k) => sliderLine(k, vals[k]))),
      '});',
      '',
      `physics(P, ${JSON.stringify(o)});`,
    ];
    return `${lines.join('\n')}\n`;
  }
  // the options object of physics(P, {…}) in the code: its place and its value (plain JSON only)
  function optsSpan(code) {
    const m = /(^|[^.\w$])physics\s*\(\s*P\s*,\s*/m.exec(code);
    if (!m) return null;
    const start = m.index + m[0].length;
    if (code[start] !== '{') return null;
    let depth = 0; let str = null;
    for (let i = start; i < code.length; i += 1) {
      const c = code[i];
      if (str) { if (c === '\\') i += 1; else if (c === str) str = null; continue; }
      if (c === '"' || c === "'" || c === '`') str = c;
      else if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') { depth -= 1; if (!depth) return { start, end: i + 1, text: code.slice(start, i + 1) }; }
    }
    return null;
  }
  function optsOf(code) {
    const sp = optsSpan(code);
    if (!sp) return {};
    try { return JSON.parse(sp.text); } catch { throw new Error('This layer\'s physics() options aren\'t plain JSON: edit them in the code.'); }
  }
  function setOpts(code, fn) {
    const sp = optsSpan(code);
    if (!sp) {
      if (!isPhysics(code)) throw new Error('Not a physics layer.');
      return code.replace(/(^|[^.\w$])physics\s*\(\s*P\s*\)/m, (m0, a) => { const o = {}; fn(o); return `${a}physics(P, ${JSON.stringify(o)})`; });
    }
    const o = optsOf(code); fn(o);
    return `${code.slice(0, sp.start)}${JSON.stringify(o)}${code.slice(sp.end)}`;
  }
  const OPT_KEYS = ['build', 'text', 'font', 'source', 'seed', 'dropAt', 'kickOnly', 'kickStart', 'walls', 'ceiling', 'ground', 'iters', 'release', 'shadows'];
  const keyRe = (k) => new RegExp(`^([ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|[^,}]+)`, 'm');
  const presetIdOf = (code) => /\(preset ([\w-]+)\)/.exec(String(code || ''))?.[1] || null;
  const sliderKeys = (code) => [...String(code).matchAll(/^[ \t]*(\w+)\s*:\s*\{\s*value\s*:/gm)].map((m) => m[1]).filter((k) => PD.SLIDERS[k]);
  // a slider's value in the code (its tweak line), or a new line from the catalogue; options for what isn't a slider
  function setValue(code, key, value) {
    const k = Object.keys(PD.SLIDERS).find((x) => x.toLowerCase() === String(key).toLowerCase()) || Object.keys(PD.SLIDERS).find((x) => norm(PD.SLIDERS[x].label) === norm(key) || norm(PD.SLIDERS[x].label).startsWith(norm(key)));
    if (!k) {
      if (OPT_KEYS.includes(key)) {
        let v = value;
        if (key === 'build' && !PD.BUILDS.includes(String(v))) throw new Error(`build: ${PD.BUILDS.join(' | ')}`);
        if (['seed', 'ceiling', 'iters'].includes(key)) v = Number(v);
        if (key === 'dropAt') v = String(v).split(/[\s,]+/).map(Number).filter(Number.isFinite);
        if (['kickStart', 'ground', 'release', 'shadows'].includes(key)) v = !/^(false|off|no|0)$/i.test(String(v));
        return { code: setOpts(code, (o) => { o[key] = v; }), key, value: Array.isArray(v) ? v.join(', ') : v };
      }
      throw new Error(`No physics slider "${key}". Sliders: ${Object.keys(PD.SLIDERS).join(', ')} · options: ${OPT_KEYS.join(', ')}`);
    }
    const s = PD.SLIDERS[k];
    let v = value;
    if (s.options) { v = String(value); if (!s.options.includes(v)) throw new Error(`${s.label}: ${s.options.join(' | ')}`); }
    else if (typeof s.value === 'string') { v = String(value); if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${s.label}: a color like #ff8800`); }
    else { v = Number(value); if (!Number.isFinite(v)) throw new Error(`${s.label}: a number (${s.min}–${s.max})`); v = Math.max(s.min, Math.min(s.max, v)); }
    const re = keyRe(k);
    if (re.test(code)) return { code: code.replace(re, (m0, a) => `${a}${lit(v)}`), key: k, value: v };
    // a slider the layer didn't have: added at the end of its tweak({ … })
    const at = code.search(/^\}\);[ \t]*$/m);
    if (at < 0 || !/const P = tweak\(\{/.test(code)) throw new Error('This layer has no tweak({…}) block to add the slider to.');
    return { code: `${code.slice(0, at)}${sliderLine(k, v)}\n${code.slice(at)}`, key: k, value: v, added: true };
  }

  // ---------- reaching a layer (the scene on screen, or a chat's scene through the director's tools) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  const onScreen = (ctx = {}) => { if (!ctx.chatId || typeof ChatScenes === 'undefined') return true; const r = ChatScenes.routeThree('three_layers', ctx.chatId); return !r || r.sketchId === ThreeLab.scenes?.currentId(); };
  const isRow = (L) => /^physics/.test(L.kind || '');
  async function target(ref, ctx = {}) {
    const v = await call('three_layers', { rows: true }, ctx);
    const pool = (v.layers || []).filter(isRow);
    if (!pool.length) throw new Error('No ⚛ physics layer in this scene: /physics <preset> adds one (/physics list).');
    if (ref != null && ref !== '' && ref !== 'selected') {
      const r = String(ref).toLowerCase().replace(/^⚛\s*/, '');
      const hit = pool.find((L) => L.id === ref || L.name.toLowerCase() === String(ref).toLowerCase() || L.name.toLowerCase().replace(/^⚛\s*/, '') === r) || pool.find((L) => L.name.toLowerCase().includes(r));
      if (!hit) throw new Error(`No physics layer "${ref}". Physics layers: ${pool.map((L) => L.name).join(', ')}`);
      return hit;
    }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  async function codeOf(L, ctx = {}) {
    if (onScreen(ctx) && D()) return D().codeOf(L.id).code;
    const v = await call('three_read_code', { layer: L.id, from: 1, to: 4000, force: true }, ctx);
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  function stateOf(L, ctx = {}) {
    const errs = (D() && onScreen(ctx) ? D().report().errors : []).filter((e) => e.layer === L.name);
    const i = info.get(L.id);
    const kinds = i?.kinds ? Object.entries(i.kinds).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') : null;
    return { layer: L.name, ...(errs.length ? { errors: errs.map((e) => `line ${e.line ?? '?'}: ${e.message}`) } : {}), ...(i ? { build: i.build, bodies: i.bodies, particles: i.particles, ...(kinds ? { drawn: kinds } : {}), ...(i.waiting ? { waiting: `for ${i.waiting}` } : {}), ...(i.model ? { model: i.model } : {}) } : {}) };
  }
  async function apply(L, code, ctx = {}, wait = 1.2) {
    await call('three_update_layer', { layer: L.id, code, wait }, ctx);
    return stateOf(L, ctx);
  }
  const uniqueName = (n) => `⚛ ${String(n || 'Physics').replace(/^⚛\s*/, '').slice(0, 36)}`;
  async function addLayer(code, name, ctx = {}, wait = 1.5) {
    const out = await call('three_add_layer', { name, code, wait }, ctx);
    const v = await call('three_layers', { rows: true }, ctx).catch(() => null);
    const row = v?.layers?.find((x) => x.name === (out.added || name));
    return row ? stateOf(row, ctx) : { layer: out.added || name };
  }

  // ---------- the operations (chat commands, the director's tool, the menus) ----------
  // add a preset: { name, text, source (a 🧊 model layer), sliders, opts }
  async function add(q0, { name = null, text = null, source = null, sliders = {}, opts = {}, ctx = {}, replace = null } = {}) {
    const p = preset(q0);
    if (!p) throw new Error(`No preset "${q0}". /physics list shows them (${PD.PRESETS.length}).`);
    const o = { ...opts };
    if (text != null && text !== '') { o.text = String(text).slice(0, 40); if (!/letters/.test(p.opts.build)) o.build = 'letters'; }
    if (source) o.source = String(source);
    const nm = name || (o.text ? `${p.name}: ${o.text}` : p.name);
    const code = codeFor(p, { name: nm, sliders, opts: o });
    if (replace) { const L = await target(replace === true ? null : replace, ctx); return { ...(await apply(L, code, ctx)), from: p.name }; }
    return { ...(await addLayer(code, uniqueName(nm), ctx)), from: p.name };
  }
  async function set(ref, values, ctx = {}) {
    const L = await target(ref, ctx);
    let code = await codeOf(L, ctx);
    const done = [];
    for (const [k, v] of Object.entries(values || {})) { const r = setValue(code, k, v); code = r.code; done.push(`${r.key} = ${r.value ?? v}${r.added ? ' (slider added)' : ''}`); }
    if (!done.length) throw new Error('set: { slider: value, … }');
    return { ...(await apply(L, code, ctx)), set: done };
  }
  // a body of your own into opts.bodies: { type, at: [x, y, z], size, r, color, fixed, mass, soft, pin, length, ball }
  async function body(ref, b = {}, ctx = {}) {
    const type = String(b.type || 'box').toLowerCase().replace(/^sphere$/, 'ball');
    if (!PD.BODIES[type]) throw new Error(`Bodies: ${Object.entries(PD.BODIES).map(([k, v]) => `${k} (${v})`).join(' · ')}`);
    const L = await target(ref, ctx);
    const one = { type };
    for (const k of ['at', 'size', 'r', 'color', 'fixed', 'mass', 'soft', 'pin', 'length', 'ball', 'v', 'plane']) if (b[k] != null && b[k] !== '') one[k] = b[k];
    if (!one.at) one.at = [0, type === 'cloth' || type === 'rope' ? 3 : 2.5, 0];
    let n = 0;
    const code = setOpts(await codeOf(L, ctx), (o) => { o.bodies = [...(Array.isArray(o.bodies) ? o.bodies : []), one].slice(-200); n = o.bodies.length; });
    return { ...(await apply(L, code, ctx)), added: `${type} at ${one.at.join(', ')}`, ownBodies: n };
  }
  // a kick / drop / reset now (live: not on the timeline; the scene on screen only)
  async function poke(ref, what, ctx = {}) {
    const w = String(what || '').toLowerCase();
    if (!['kick', 'drop', 'reset'].includes(w)) throw new Error('poke: kick | drop | reset');
    const L = await target(ref, ctx);
    if (!onScreen(ctx) || !D()) throw new Error('That scene isn\'t on screen: open it in the Lab first.');
    const r = await D().evalInSketch(`return window.__labPhysics.poke(${JSON.stringify(L.id)}, ${JSON.stringify(w)})`);
    if (!r?.ok || !r.value) throw new Error(r?.error || 'The layer isn\'t running (an error?).');
    return { layer: L.name, poked: w };
  }
  // the preset's music links (/react-to) on the layer's sliders, or kick + bass defaults
  async function react(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const code = await codeOf(L, ctx);
    const pid = presetIdOf(code);
    const p = PD.PRESETS.find((x) => x.id === pid);
    if (p?.react?.length && typeof ThreeAudio !== 'undefined') {
      const row = onScreen(ctx) ? ThreeAudio.lab?.layers().find((x) => x.name === L.name) : null;
      if (row?.ctl) {
        const out = [];
        for (const [key, feat, amount] of p.react) { const hit = row.ctl.resolve?.(key); if (!hit || hit.kind !== 'number') continue; const band = ThreeAudio.resolve?.(feat) || feat; row.ctl.bind(hit.key, band, amount); out.push(`${hit.label} → ${ThreeAudio.label?.(band) || band} ${Math.round(amount * 100)}%`); }
        if (out.length) return { layer: L.name, react: out };
      }
    }
    const cloth = /"build":"(flag|curtain|beads|balloons)"/.test(code);
    const vals = cloth ? { kick: 2, kickMode: 'gust', bassWind: 6 } : { kick: 3, bassGravity: 0.4, drop: 8 };
    const r = await set(L.id, vals, ctx);
    return { ...r, react: Object.entries(vals).map(([k, v]) => `${k} ${v}`).join(' · ') };
  }
  async function infoOf(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const code = await codeOf(L, ctx);
    let o = {}; try { o = optsOf(code); } catch { /* hand-written options */ }
    let live = null;
    if (onScreen(ctx) && D()) { const r = await D().evalInSketch(`return window.__labPhysics.probe(${JSON.stringify(L.id)})`).catch(() => null); if (r?.ok && r.value) { const v = r.value; live = { simT: `${Math.round(v.simT * 100) / 100} s`, awake: v.awake, asleep: v.asleep, ...(v.behind > 0 ? { catchingUp: `${v.behind} steps` } : {}), cachedStates: v.snaps }; } }
    return { ...stateOf(L, ctx), preset: presetIdOf(code), options: o, sliders: sliderKeys(code), ...(live ? { now: live } : {}) };
  }
  function listText(filter = '') {
    const w = String(filter).toLowerCase().trim();
    const L = PD.PRESETS.filter((p) => !w || `${p.id} ${p.name} ${p.cat} ${p.desc} ${p.opts.build}`.toLowerCase().includes(w));
    const cats = [...new Set(L.map((p) => p.cat))];
    return cats.map((c) => `**${c}**\n${L.filter((p) => p.cat === c).map((p) => `- \`/physics ${p.id}\` ${p.name}: ${p.desc}`).join('\n')}`).join('\n') || 'No preset matches.';
  }

  // ---------- the picker: one searchable list ----------
  function picker({ replace = false } = {}) {
    const shade = el('div', { class: 'sh-shade', on: { pointerdown: (e) => { if (e.target === shade) shade.remove(); } } });
    const box = el('div', { class: 'sh-dlg sh-lib', attrs: { role: 'dialog', 'aria-label': 'Physics presets' } });
    shade.append(box);
    shade.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); shade.remove(); } });
    document.body.append(shade);
    const input = el('input', { type: 'search', class: 'sh-search', placeholder: `Search ${PD.PRESETS.length} physics presets (balls, cloth, dominoes, jelly, letters, drop…)`, attrs: { 'aria-label': 'Search physics presets' } });
    const list = el('div', { class: 'sh-list', attrs: { role: 'listbox' } });
    box.append(el('div', { class: 'sh-head' }, el('b', { text: '⚛ Light physics' })), input, list, el('div', { class: 'hint', text: 'Enter adds a layer · Shift+Enter replaces the selected physics layer · Esc closes' }));
    let rows = []; let at = 0;
    const go = (p, rep) => {
      shade.remove();
      const ask = /letters/.test(p.opts.build) ? Modal.prompt('Letters', { value: p.opts.text || 'HEARTH', label: 'The word or words' }) : null;
      Promise.resolve(ask).then((txt) => (/letters/.test(p.opts.build) && txt === null ? null : add(p.id, { text: txt || null, replace: rep || replace ? true : null })))
        .then((r) => r && toast(`⚛ ${p.name}${r.errors ? ` · ${r.errors[0]}` : ''}`, { timeout: 1800 })).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const draw = () => {
      const w = input.value.toLowerCase().trim();
      rows = PD.PRESETS.filter((p) => !w || `${p.name} ${p.cat} ${p.desc} ${p.id} ${p.opts.build}`.toLowerCase().includes(w));
      at = Math.min(at, Math.max(0, rows.length - 1));
      list.replaceChildren(...rows.map((p, i) => el('button', { type: 'button', class: `sh-item${i === at ? ' on' : ''}`, attrs: { role: 'option' }, on: { click: (e) => go(p, e.shiftKey) } },
        el('b', { text: p.name }), el('span', { class: 'sh-cat', text: p.cat }), el('span', { class: 'hint', text: p.desc }))));
    };
    input.addEventListener('input', () => { at = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); draw(); list.children[at]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && rows[at]) { e.preventDefault(); go(rows[at], e.shiftKey); }
    });
    draw();
    input.focus();
    return { close: () => shade.remove() };
  }

  // ---------- menus ----------
  const quick = (p, ok) => () => p().then((r) => ok && toast(typeof ok === 'function' ? ok(r) : ok, { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' }));
  function layerMenu(L) {
    if (!L?.code || !isPhysics(L.code)) return [];
    let o = {}; try { o = optsOf(L.code); } catch { /* hand-written */ }
    return [['⚛ Physics', o.build || 'scene', [
      ['Kick now', 'a push on everything', quick(() => poke(L.id, 'kick'), '⚛ kick')],
      ['Drop now', 'the blast (and pins let go)', quick(() => poke(L.id, 'drop'), '⚛ drop')],
      ['Start again', 'from the first step', quick(() => poke(L.id, 'reset'), '⚛ from the start')],
      ['Add a body', '', Object.entries(PD.BODIES).map(([k, v]) => [k, v, quick(() => body(L.id, { type: k }), `⚛ ${k} added`)])],
      ['Kick does', '', PD.SLIDERS.kickMode.options.map((x) => [x, '', quick(() => set(L.id, { kickMode: x, ...(/^\s*kick:\s*\{\s*value:\s*0\s*,/m.test(L.code) ? { kick: 3 } : {}) }), `⚛ kick: ${x}`)])],
      ['♪ React to the music', 'kicks, bass, drops', quick(() => react(L.id), (r) => `♪ ${Array.isArray(r.react) ? r.react.join(' · ') : r.react}`)],
      ['Replace with a preset…', '', () => picker({ replace: true })],
    ]]];
  }
  function previewItem() {
    return { label: '⚛ Physics', hint: 'light physics', items: () => [
      { label: '⚛ New physics layer…', hint: `${PD.PRESETS.length} presets`, action: () => picker() },
      { label: 'Falling letters…', hint: 'a word of blocks', action: () => Promise.resolve(Modal.prompt('Letters', { value: 'HEARTH', label: 'The word or words' })).then((t) => t !== null && add('letters', { text: t || 'HEARTH' })).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Bouncing balls on beat', hint: 'kicks', action: quick(() => add('bounce'), '⚛ Bouncing balls') },
      { label: 'Cloth in the wind', hint: 'a flag', action: quick(() => add('flag'), '⚛ Flag') },
      { label: 'Model rain', hint: 'the 🧊 model layer', action: quick(() => add('models'), '⚛ Model rain') },
    ] };
  }

  // ---------- hooks (tools/three.js) ----------
  function onBox(msg) {
    if (msg.type !== 'physics-info') return;
    info.set(msg.layer, msg);
    if (info.size > 64) info.delete(info.keys().next().value);
  }

  // ---------- the director's tool: three_do physics { op } ----------
  const OPS = 'list {filter} | add {preset, name, text, source (a 🧊 model layer), sliders: {key: value}, opts} | set {layer, values: {slider|option: value}} | body {layer, type, at, size, r, color, fixed, pin, length, ball} | poke {layer, what: kick|drop|reset} | react {layer} | info {layer} | help';
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || 'help');
    if (o === 'help') return PD.HELP;
    if (o === 'list') return PD.PRESETS.filter((p) => !a.filter || `${p.id} ${p.name} ${p.cat} ${p.desc} ${p.opts.build}`.toLowerCase().includes(String(a.filter).toLowerCase())).map((p) => `${p.id}: ${p.name} (${p.cat}, ${p.opts.build}) ${p.desc}`).join('\n');
    if (o === 'add') return add(a.preset || a.id || 'bounce', { name: a.name, text: a.text, source: a.source || a.model || null, sliders: a.sliders || a.values || {}, opts: a.opts || {}, ctx, replace: a.replace || null });
    if (o === 'set') return set(a.layer, a.values || a.sliders || Object.fromEntries(Object.entries(a).filter(([k]) => !['op', 'cmd', 'layer'].includes(k))), ctx);
    if (o === 'body') return body(a.layer, a, ctx);
    if (o === 'poke' || o === 'kick' || o === 'drop' || o === 'reset') return poke(a.layer, o === 'poke' ? a.what || a.value : o, ctx);
    if (o === 'react') return react(a.layer, ctx);
    if (o === 'info') return infoOf(a.layer, ctx);
    throw new Error(`physics ops: ${OPS}`);
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_physics'], async (tool, args, ctx) => {
    try { return { ok: true, value: await op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  // ---------- presets in the FX picker / /template / three_add_layer {template} ----------
  if (typeof ThreeLayers !== 'undefined') {
    for (const p of PD.PRESETS) {
      const id = `physics-${p.id}`;
      if (ThreeLayers.TEMPLATES.some((t) => t.id === id)) continue;
      ThreeLayers.TEMPLATES.push({ id, name: `⚛ ${p.name}`, cat: 'Physics', desc: p.desc, tags: `physics rigid soft cloth ${p.cat.toLowerCase()} ${p.opts.build}`, get code() { return codeFor(p); } });
    }
  }

  // ---------- chat commands ----------
  const fmt = (r) => (typeof r === 'string' ? r : Object.entries(r).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' · ') : v && typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
  const said = (r) => `⚛ "${r.layer}"${r.from ? ` (${r.from})` : ''}${r.bodies ? ` · ${r.bodies} bodies` : ''}${r.drawn ? ` (${r.drawn})` : ''}${r.waiting ? ` · waiting ${r.waiting}` : ''}${r.errors ? ` · ${r.errors[0]}` : ''}`;
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('physics')) return;
    Commands.register({
      name: 'physics', area: 'Three.js Lab', aliases: ['phys'],
      args: '[<preset> | list [word] | text <words> | model [layer] | set <slider> <value> | add <box|ball|blob|cloth|rope|ragdoll|water> | kick | drop | reset | react | info | help]',
      desc: '⚛ Light physics: a physics layer from a preset (bouncing balls on beat, falling letters, dominoes, Newton\'s cradle, cloth in the wind, jelly, ragdolls, water…), music-driven, renders match',
      examples: ['/physics', '/physics bounce', '/physics text HELLO', '/physics dominoes', '/physics flag', '/physics set gravity 0.3', '/physics add ball', '/physics kick', '/physics list cloth'],
      keywords: 'physics rigid body soft body cloth rope ragdoll jelly blob fluid water sph domino pendulum newton cradle gravity collision bounce flag curtain topple drop',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^set\b/.test(w)) { const k = w.slice(3).trim(); return [...Object.keys(PD.SLIDERS), ...OPT_KEYS].filter((x) => !k || x.toLowerCase().startsWith(k)).slice(0, 40).map((x) => ({ value: `set ${x} `, hint: PD.SLIDERS[x]?.label || 'option' })); }
        if (/^add\b/.test(w)) return Object.entries(PD.BODIES).map(([k, v]) => ({ value: `add ${k}`, hint: v })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'list', hint: `the ${PD.PRESETS.length} presets` }, { value: 'text ', hint: 'falling letters of a word' }, { value: 'model', hint: 'copies of the 🧊 model' }, { value: 'set ', hint: 'a slider or option' }, { value: 'add ', hint: 'a body of your own' }, { value: 'kick', hint: 'a push now' }, { value: 'drop', hint: 'the blast now' }, { value: 'reset', hint: 'start again' }, { value: 'react', hint: '♪ follow the music' }, { value: 'info' }, { value: 'help' }];
        return [...PD.PRESETS.map((p) => ({ value: p.id, hint: `${p.name} · ${p.cat}` })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' ');
        const v = (verb || '').toLowerCase();
        if (!v || (v === 'new' && !tail)) { await ThreeLab.cmd(); picker(); return null; }
        if (v === 'help') return `\`\`\`\n${PD.HELP}\n\`\`\``;
        if (v === 'list') return listText(tail);
        if (v === 'new') { await ThreeLab.cmd(); return said(await add(tail)); }
        if (v === 'text' || v === 'word' || v === 'letters') { await ThreeLab.cmd(); return said(await add('letters', { text: tail || 'HEARTH' })); }
        if (v === 'model' || v === 'models') { await ThreeLab.cmd(); return said(await add('models', { source: tail || 'auto' })); }
        if (v === 'set') { const [k, ...vv] = rest; if (!k || !vv.length) return 'Usage: /physics set <slider> <value> (/physics help lists them)'; const r = await set(null, { [k]: vv.join(' ') }); return `⚛ "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'add') { if (!rest[0]) return `Usage: /physics add <${Object.keys(PD.BODIES).join('|')}>`; if (preset(tail) && !PD.BODIES[rest[0].toLowerCase()]) { await ThreeLab.cmd(); return said(await add(tail)); } const r = await body(null, { type: rest[0] }); return `⚛ "${r.layer}": ${r.added}`; }
        if (v === 'kick' || v === 'drop' || v === 'reset') { const r = await poke(null, v); return `⚛ "${r.layer}": ${r.poked}`; }
        if (v === 'react') { const r = await react(null); return `♪ "${r.layer}": ${Array.isArray(r.react) ? r.react.join(' · ') : r.react}`; }
        if (v === 'info') return fmt(await infoOf(null));
        if (preset(w)) { await ThreeLab.cmd(); return said(await add(w)); }
        return `Unknown: ${verb}. /physics help`;
      },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: ⚛ Light physics (presets)…', () => ThreeLab.cmd().then(() => picker()));
    AppUI.addAction('Lab: ⚛ Falling letters…', () => ThreeLab.cmd().then(() => Promise.resolve(Modal.prompt('Letters', { value: 'HEARTH', label: 'The word or words' }))).then((t) => t !== null && add('letters', { text: t || 'HEARTH' })).catch((e) => toast(e.message, { type: 'error' })));
  }

  return { isPhysics, preset, codeFor, optsOf, setOpts, setValue, onBox, layerMenu, previewItem, picker, op, add, set, body, poke, react, infoOf, info: (id) => info.get(id) || null, OPS, PRESETS: PD.PRESETS };
})();
window.LabPhysics = LabPhysics;
