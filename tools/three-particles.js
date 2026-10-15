// ✦ GPU particles (round 24, particles): particle layers in the Lab, the hub side.
// - A ✦ layer is plain layer code calling particles(P, opts) (simulated and drawn by tools/three-sandbox.html "GPU
//   particles": float textures stepped on the GPU at 60 steps a second of the scene's clock, points / streaks /
//   instanced meshes, trails). Its sliders are a normal tweak(): Save, Shuffle, looks, keyframes and ♪ react-to work.
// - Presets (tools/three-particles-data.js): one searchable picker (/particles, right-click the preview › ＋ Add › ✦ Particles,
//   Ctrl/⌘+K, the FX picker's "Particles" category, /template particles-<id>).
// - Edits go through the layer's code (undoable, the time machine sees them): a slider's value, a slider added, the
//   options (emitter, text, source layer, look).
// - Chat: /particles (<preset> · list · text · model · picture · from · set · emitter · look · react · info · help).
//   Directors: three_do particles { op } (list · add · set · emitter · look · react · info · help), lean: explained
//   on demand by three_do help particles (nothing added to the prompt or the tool descriptions).
const LabParticles = (() => {
  const PD = ParticleData;
  const info = new Map(); // layer id → the page's last particles-info
  const D = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director : null);
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const fmtNum = (n) => { const x = Math.round(Number(n) * 10000) / 10000; return Number.isFinite(x) ? String(x) : '0'; };
  const lit = (v) => (typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? String(v) : q(v));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const isParticles = (code) => /(^|[^.\w$])particles\s*\(\s*P\s*[,)]/m.test(String(code || ''));

  // ---------- presets → layer code ----------
  function preset(q0) {
    const w = norm(q0);
    if (!w) return null;
    const L = PD.PRESETS;
    return L.find((p) => p.id === q0 || norm(p.id) === w || norm(p.name) === w) || L.find((p) => norm(p.name).startsWith(w) || norm(p.id).startsWith(w)) || L.find((p) => norm(`${p.name} ${p.cat} ${p.desc}`).includes(w)) || null;
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
    for (const [k, v] of Object.entries(vals)) if (!PD.SLIDERS[k]) o[k] = v; // (bounds, homeJitter…: options, not sliders)
    const groups = [...new Set(keys.map((k) => PD.SLIDERS[k].group))];
    const lines = [
      `// ✦ Particles: ${name || p.name} (preset ${p.id}) · GPU particles: /particles, three_do particles.`,
      '// The sliders are live (♪ react-to, keyframes, Shuffle); the options at the end set the emitter and the look:',
      `// emitter ${PD.EMITTERS.join(' | ')} · look points | streak | mesh · /particles help`,
      'const P = tweak({',
      ...groups.flatMap((g) => keys.filter((k) => PD.SLIDERS[k].group === g).map((k) => sliderLine(k, vals[k]))),
      '});',
      '',
      `particles(P, ${JSON.stringify(o)});`,
    ];
    return `${lines.join('\n')}\n`;
  }
  // the options object of particles(P, {…}) in the code: its place and its value (plain JSON only)
  function optsSpan(code) {
    const m = /(^|[^.\w$])particles\s*\(\s*P\s*,\s*/m.exec(code);
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
    try { return JSON.parse(sp.text); } catch { throw new Error('This layer\'s particles() options aren\'t plain JSON: edit them in the code.'); }
  }
  function setOpts(code, fn) {
    const sp = optsSpan(code);
    if (!sp) {
      if (!isParticles(code)) throw new Error('Not a particle layer.');
      return code.replace(/(^|[^.\w$])particles\s*\(\s*P\s*\)/m, (m0, a) => { const o = {}; fn(o); return `${a}particles(P, ${JSON.stringify(o)})`; });
    }
    const o = optsOf(code); fn(o);
    return `${code.slice(0, sp.start)}${JSON.stringify(o)}${code.slice(sp.end)}`;
  }
  const keyRe = (k) => new RegExp(`^([ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|[^,}]+)`, 'm');
  const presetIdOf = (code) => /\(preset ([\w-]+)\)/.exec(String(code || ''))?.[1] || null;
  const sliderKeys = (code) => [...String(code).matchAll(/^[ \t]*(\w+)\s*:\s*\{\s*value\s*:/gm)].map((m) => m[1]).filter((k) => PD.SLIDERS[k]);
  // a slider's value in the code (its tweak line), or a new line from the catalogue; options for what isn't a slider
  function setValue(code, key, value) {
    const k = Object.keys(PD.SLIDERS).find((x) => x.toLowerCase() === String(key).toLowerCase()) || Object.keys(PD.SLIDERS).find((x) => norm(PD.SLIDERS[x].label) === norm(key) || norm(PD.SLIDERS[x].label).startsWith(norm(key)));
    if (!k) {
      if (['bounds', 'sink', 'homeJitter', 'seed', 'text', 'font', 'source', 'image', 'mesh', 'camera', 'arms', 'twist', 'bg', 'emitter'].includes(key)) return { code: setOpts(code, (o) => { o[key] = value; }), key };
      throw new Error(`No particle slider "${key}". Sliders: ${Object.keys(PD.SLIDERS).join(', ')}`);
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
  const isRow = (L) => /^particles/.test(L.kind || '');
  async function target(ref, ctx = {}) {
    const v = await call('three_layers', { report: 'full' }, ctx);
    const all = v.layers || [];
    const pool = all.filter(isRow);
    if (!pool.length) throw new Error('No ✦ particle layer in this scene: /particles <preset> adds one (/particles list).');
    if (ref != null && ref !== '' && ref !== 'selected') {
      const r = String(ref).toLowerCase().replace(/^✦\s*/, '');
      const hit = pool.find((L) => L.id === ref || L.name.toLowerCase() === String(ref).toLowerCase() || L.name.toLowerCase().replace(/^✦\s*/, '') === r) || pool.find((L) => L.name.toLowerCase().includes(r));
      if (!hit) throw new Error(`No particle layer "${ref}". Particle layers: ${pool.map((L) => L.name).join(', ')}`);
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
    return { layer: L.name, ...(errs.length ? { errors: errs.map((e) => `line ${e.line ?? '?'}: ${e.message}`) } : {}), ...(i ? { particles: i.count, ...(i.capped ? { asked: i.asked, capped: 'a software GPU here: fewer particles (a real one runs them all)' } : {}), emitter: i.emitter, look: i.look, source: i.source || null, homes: i.homes, msPerFrame: Math.round(i.ms * 100) / 100 } : {}) };
  }
  async function apply(L, code, ctx = {}, wait = 1.2) {
    await call('three_update_layer', { layer: L.id, code, wait }, ctx);
    return stateOf(L, ctx);
  }
  const uniqueName = (n) => `✦ ${String(n || 'Particles').replace(/^✦\s*/, '').slice(0, 36)}`;
  async function addLayer(code, name, ctx = {}, wait = 1.5) {
    const out = await call('three_add_layer', { name, code, wait }, ctx);
    const v = await call('three_layers', { report: 'full' }, ctx).catch(() => null);
    const row = v?.layers?.find((x) => x.name === (out.added || name));
    return row ? stateOf(row, ctx) : { layer: out.added || name };
  }

  // ---------- the operations (chat commands, the director's tool, the menus) ----------
  // add a preset: { name, text, source (a layer for model / layer emitters), image (a reference), sliders, opts }
  async function add(q0, { name = null, text = null, source = null, image = null, sliders = {}, opts = {}, ctx = {}, replace = null } = {}) {
    const p = preset(q0);
    if (!p) throw new Error(`No preset "${q0}". /particles list shows them (${PD.PRESETS.length}).`);
    const o = { ...opts };
    if (text != null && text !== '') { o.text = String(text).slice(0, 80); if (!['text'].includes(p.opts.emitter)) o.emitter = 'text'; }
    if (source) o.source = String(source);
    if (image) { o.image = String(image); o.emitter = 'image'; }
    if (p.opts.emitter === 'image' && !o.image) {
      let refs = []; try { refs = D()?.refs?.list?.() || []; } catch { /* no Lab */ }
      const pic = refs.find((r) => r.kind === 'image');
      if (pic) o.image = pic.key; else throw new Error('Name a reference picture: /particles picture <reference> (this sketch has none: add one with References).');
    }
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
  async function setEmitter(ref, kind, extra = {}, ctx = {}) {
    const k = String(kind || '').toLowerCase();
    if (!PD.EMITTERS.includes(k)) throw new Error(`Emitters: ${PD.EMITTERS.map((e) => `${e} (${PD.EMITTER_HINT[e]})`).join(' · ')}`);
    const L = await target(ref, ctx);
    const code = setOpts(await codeOf(L, ctx), (o) => {
      o.emitter = k;
      for (const x of ['text', 'source', 'image', 'font']) if (extra[x] != null && extra[x] !== '') o[x] = String(extra[x]);
      if (k === 'model') { o.source ||= 'auto'; o.camera ||= 'source'; }
      if (k === 'layer') o.source ||= 'auto';
      if (k === 'text') o.text ||= 'HEARTH';
    });
    return { ...(await apply(L, code, ctx)), emitter: k };
  }
  async function setLook(ref, look, ctx = {}) {
    const L = await target(ref, ctx);
    let code = await codeOf(L, ctx);
    const w = String(look || '').toLowerCase();
    const values = {};
    if (['points', 'streak', 'mesh'].includes(w)) values.look = w;
    else if (PD.SLIDERS.sprite.options.includes(w)) { values.look = 'points'; values.sprite = w; }
    else if (['tetra', 'octa', 'box', 'shard'].includes(w)) { values.look = 'mesh'; code = setOpts(code, (o) => { o.mesh = w; }); }
    else if (['add', 'alpha'].includes(w)) values.blend = w;
    else throw new Error('Look: points | streak | mesh · sprite soft | dot | ring | star | square · mesh tetra | octa | box | shard · blend add | alpha');
    for (const [k, v] of Object.entries(values)) code = setValue(code, k, v).code;
    return { ...(await apply(L, code, ctx)), look: w };
  }
  // the preset's music links (/react-to) on the layer's sliders, or two good defaults
  async function react(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const pid = presetIdOf(await codeOf(L, ctx));
    const p = PD.PRESETS.find((x) => x.id === pid);
    const links = p?.react?.length ? p.react : [['size', 'kickOn', 0.25], ['curl', 'loudness', 0.3]];
    const lab = typeof ThreeAudio !== 'undefined' ? ThreeAudio.lab : null;
    const row = onScreen(ctx) && lab ? lab.layers().find((x) => x.name === L.name) : null;
    if (!row?.ctl) {
      // (a chat's scene that isn't on screen: the layer's own music sliders instead)
      return { ...(await set(L.id, { kickPush: 1.2, bassForce: 0.8 }, ctx)), react: 'kickPush 1.2 · bassForce 0.8 (the ♪ links need the scene on screen)' };
    }
    const out = [];
    for (const [key, feat, amount] of links) {
      const band = ThreeAudio.resolve?.(feat) || feat;
      const hit = row.ctl.resolve?.(key);
      if (!hit || hit.kind !== 'number') continue;
      row.ctl.bind(hit.key, band, amount);
      out.push(`${hit.label} → ${ThreeAudio.label?.(band) || band} ${Math.round(amount * 100)}%`);
    }
    return { layer: L.name, react: out.length ? out : 'no matching sliders' };
  }
  async function infoOf(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const code = await codeOf(L, ctx);
    let o = {}; try { o = optsOf(code); } catch { /* hand-written options */ }
    return { ...stateOf(L, ctx), preset: presetIdOf(code), options: o, sliders: sliderKeys(code) };
  }
  function listText(filter = '') {
    const w = String(filter).toLowerCase().trim();
    const L = PD.PRESETS.filter((p) => !w || `${p.id} ${p.name} ${p.cat} ${p.desc}`.toLowerCase().includes(w));
    const cats = [...new Set(L.map((p) => p.cat))];
    return cats.map((c) => `**${c}**\n${L.filter((p) => p.cat === c).map((p) => `- \`/particles ${p.id}\` ${p.name}: ${p.desc}`).join('\n')}`).join('\n') || 'No preset matches.';
  }

  // ---------- the picker: one searchable list ----------
  function picker({ replace = false } = {}) {
    const shade = el('div', { class: 'sh-shade', on: { pointerdown: (e) => { if (e.target === shade) shade.remove(); } } });
    const box = el('div', { class: 'sh-dlg sh-lib', attrs: { role: 'dialog', 'aria-label': 'Particle presets' } });
    shade.append(box);
    shade.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); shade.remove(); } });
    document.body.append(shade);
    const input = el('input', { type: 'search', class: 'sh-search', placeholder: `Search ${PD.PRESETS.length} particle presets (galaxy, smoke, kick, text, model…)`, attrs: { 'aria-label': 'Search particle presets' } });
    const list = el('div', { class: 'sh-list', attrs: { role: 'listbox' } });
    box.append(el('div', { class: 'sh-head' }, el('b', { text: '✦ GPU particles' })), input, list, el('div', { class: 'hint', text: 'Enter adds a layer · Shift+Enter replaces the selected particle layer · Esc closes' }));
    let rows = []; let at = 0;
    const go = (p, rep) => {
      shade.remove();
      const ask = p.opts.emitter === 'text' ? Modal.prompt('Particle text', { value: 'HEARTH', label: 'The word or words' }) : null;
      Promise.resolve(ask).then((txt) => (p.opts.emitter === 'text' && txt === null ? null : add(p.id, { text: txt || null, replace: rep || replace ? true : null })))
        .then((r) => r && toast(`✦ ${p.name}${r.errors ? ` · ${r.errors[0]}` : ''}`, { timeout: 1800 })).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const draw = () => {
      const w = input.value.toLowerCase().trim();
      rows = PD.PRESETS.filter((p) => !w || `${p.name} ${p.cat} ${p.desc} ${p.id} ${p.opts.emitter}`.toLowerCase().includes(w));
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
    if (!L?.code || !isParticles(L.code)) return [];
    let o = {}; try { o = optsOf(L.code); } catch { /* hand-written */ }
    return [['✦ Particles', `${o.emitter || 'sphere'} · GPU`, [
      ['Drawn as', 'points, streaks, little meshes', ['points', 'streak', 'mesh'].map((x) => [x, '', quick(() => setLook(L.id, x), `✦ ${x}`)])],
      ['Sprite', '', PD.SLIDERS.sprite.options.map((x) => [x, '', quick(() => setLook(L.id, x), `✦ ${x}`)])],
      ['Emitter', PD.EMITTER_HINT[o.emitter] || '', PD.EMITTERS.filter((e) => e !== 'image').map((e) => [e, PD.EMITTER_HINT[e], quick(() => setEmitter(L.id, e), `✦ born on ${PD.EMITTER_HINT[e]}`)])],
      ['♪ React to the music', 'the preset\'s links (/react-to)', quick(() => react(L.id), (r) => `♪ ${Array.isArray(r.react) ? r.react.join(' · ') : r.react}`)],
      ['Replace with a preset…', '', () => picker({ replace: true })],
    ]]];
  }
  function previewItem() {
    return { label: '✦ Particles', hint: 'GPU', items: () => [
      { label: '✦ New particle layer…', hint: `${PD.PRESETS.length} presets`, action: () => picker() },
      { label: 'Particle word…', hint: 'text that dissolves', action: () => Promise.resolve(Modal.prompt('Particle text', { value: 'HEARTH', label: 'The word or words' })).then((t) => t !== null && add('dissolve', { text: t || 'HEARTH' })).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Model into dust', hint: 'the 🧊 model layer', action: quick(() => add('modeldust'), '✦ Model into dust') },
      { label: 'Light off this scene', hint: 'bright pixels of the layer below', action: quick(() => add('glowrise'), '✦ Light rising') },
    ] };
  }

  // ---------- hooks (tools/three.js) ----------
  function onBox(msg) {
    if (msg.type !== 'particles-info') return;
    info.set(msg.layer, msg);
    if (info.size > 64) info.delete(info.keys().next().value);
  }

  // ---------- the director's tool: three_do particles { op } ----------
  const OPS = 'list {filter} | add {preset, name, text, source (a layer: model / layer emitters), image (a reference), sliders: {key: value}} | set {layer, values: {slider: value}} | emitter {layer, kind, text, source, image} | look {layer, look: points|streak|mesh|<sprite>|<mesh shape>|add|alpha} | react {layer} | info {layer} | help';
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || 'help');
    if (o === 'help') return PD.HELP;
    if (o === 'list') return PD.PRESETS.filter((p) => !a.filter || `${p.id} ${p.name} ${p.cat} ${p.desc}`.toLowerCase().includes(String(a.filter).toLowerCase())).map((p) => `${p.id}: ${p.name} (${p.cat}, ${p.opts.emitter}) ${p.desc}`).join('\n');
    if (o === 'add') return add(a.preset || a.id || 'galaxy', { name: a.name, text: a.text, source: a.source || a.model || null, image: a.image || null, sliders: a.sliders || a.values || {}, opts: a.opts || {}, ctx, replace: a.replace || null });
    if (o === 'set') return set(a.layer, a.values || a.sliders || Object.fromEntries(Object.entries(a).filter(([k]) => !['op', 'cmd', 'layer'].includes(k))), ctx);
    if (o === 'emitter') return setEmitter(a.layer, a.kind || a.emitter, a, ctx);
    if (o === 'look') return setLook(a.layer, a.look || a.value, ctx);
    if (o === 'react') return react(a.layer, ctx);
    if (o === 'info') return infoOf(a.layer, ctx);
    throw new Error(`particles ops: ${OPS}`);
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_particles'], async (tool, args, ctx) => {
    try { return { ok: true, value: await op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  // ---------- presets in the FX picker / /template / three_add_layer {template} ----------
  if (typeof ThreeLayers !== 'undefined') {
    for (const p of PD.PRESETS) {
      const id = `particles-${p.id}`;
      if (ThreeLayers.TEMPLATES.some((t) => t.id === id) || p.opts.emitter === 'image') continue;
      ThreeLayers.TEMPLATES.push({ id, name: `✦ ${p.name}`, cat: 'Particles', desc: p.desc, tags: `particles gpu ${p.cat.toLowerCase()} ${p.opts.emitter}`, get code() { return codeFor(p); } });
    }
  }

  // ---------- chat commands ----------
  const fmt = (r) => (typeof r === 'string' ? r : Object.entries(r).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' · ') : v && typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
  const said = (r) => `✦ "${r.layer}"${r.from ? ` (${r.from})` : ''}${r.particles ? ` · ${Math.round(r.particles / 1000)}k particles` : ''}${r.capped ? ` (${r.capped})` : ''}${r.errors ? ` · ${r.errors[0]}` : ''}`;
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('particles')) return;
    Commands.register({
      name: 'particles', area: 'Three.js Lab', aliases: ['gpu-particles'],
      args: '[<preset> | list [word] | text <words> | model [layer] | picture <reference> | from <layer> | set <slider> <value> | emitter <kind> | look <points|streak|mesh|sprite> | react | info | help]',
      desc: '✦ GPU particles: a particle layer from a preset (galaxy, smoke, sparks on kick, text that dissolves, model into dust…), 100k–2M particles, music-reactive',
      examples: ['/particles', '/particles galaxy', '/particles text HELLO', '/particles model', '/particles sparks', '/particles set curl 1.2', '/particles look streak', '/particles react', '/particles list music'],
      keywords: 'gpu particles gpgpu emitter curl noise flow field attractor vortex boids trails sparks smoke snow rain galaxy nebula fireflies dissolve dust instanced',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^set\b/.test(w)) { const k = w.slice(3).trim(); return Object.keys(PD.SLIDERS).filter((x) => !k || x.toLowerCase().startsWith(k)).slice(0, 30).map((x) => ({ value: `set ${x} `, hint: PD.SLIDERS[x].label })); }
        if (/^emitter\b/.test(w)) return PD.EMITTERS.map((e) => ({ value: `emitter ${e}`, hint: PD.EMITTER_HINT[e] })).filter((x) => x.value.startsWith(w));
        if (/^look\b/.test(w)) return ['points', 'streak', 'mesh', ...PD.SLIDERS.sprite.options, 'add', 'alpha'].map((x) => ({ value: `look ${x}` })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'list', hint: `the ${PD.PRESETS.length} presets` }, { value: 'text ', hint: 'a word in particles that dissolves' }, { value: 'model', hint: 'the 🧊 model turns to dust' }, { value: 'picture ', hint: 'a reference picture in particles' }, { value: 'from ', hint: 'light rising off a layer' }, { value: 'set ', hint: 'a slider' }, { value: 'emitter ', hint: 'where they are born' }, { value: 'look ', hint: 'points, streaks, meshes' }, { value: 'react', hint: '♪ follow the music' }, { value: 'info' }, { value: 'help' }];
        return [...PD.PRESETS.map((p) => ({ value: p.id, hint: `${p.name} · ${p.cat}` })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' ');
        const v = (verb || '').toLowerCase();
        if (!v || v === 'new' && !tail) { await ThreeLab.cmd(); picker(); return null; }
        if (v === 'help') return `\`\`\`\n${PD.HELP}\n\`\`\``;
        if (v === 'list') return listText(tail);
        if (v === 'new' || v === 'add') { await ThreeLab.cmd(); return said(await add(tail)); }
        if (v === 'text' || v === 'word') { await ThreeLab.cmd(); return said(await add('dissolve', { text: tail || 'HEARTH' })); }
        if (v === 'model' || v === 'dust') { await ThreeLab.cmd(); return said(await add('modeldust', { source: tail || 'auto' })); }
        if (v === 'picture' || v === 'image') { await ThreeLab.cmd(); return said(await add('picture', { image: tail || null })); }
        if (v === 'from') { await ThreeLab.cmd(); return said(await add('glowrise', { source: tail || 'auto' })); }
        if (v === 'set') { const [k, ...vv] = rest; if (!k || !vv.length) return 'Usage: /particles set <slider> <value> (/particles help lists them)'; const r = await set(null, { [k]: vv.join(' ') }); return `✦ "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'emitter') { const [k, ...x] = rest; const r = await setEmitter(null, k, { text: k === 'text' ? x.join(' ') : null, source: ['model', 'layer'].includes(k) ? x.join(' ') : null, image: k === 'image' ? x.join(' ') : null }); return `✦ "${r.layer}" born on ${PD.EMITTER_HINT[r.emitter]}`; }
        if (v === 'look') { const r = await setLook(null, tail); return `✦ "${r.layer}" drawn as ${r.look}`; }
        if (v === 'react') { const r = await react(null); return `♪ "${r.layer}": ${Array.isArray(r.react) ? r.react.join(' · ') : r.react}`; }
        if (v === 'info') return fmt(await infoOf(null));
        if (preset(w)) { await ThreeLab.cmd(); return said(await add(w)); }
        return `Unknown: ${verb}. /particles help`;
      },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: ✦ GPU particles (presets)…', () => ThreeLab.cmd().then(() => picker()));
    AppUI.addAction('Lab: ✦ Particle word (text that dissolves)…', () => ThreeLab.cmd().then(() => Promise.resolve(Modal.prompt('Particle text', { value: 'HEARTH', label: 'The word or words' }))).then((t) => t !== null && add('dissolve', { text: t || 'HEARTH' })).catch((e) => toast(e.message, { type: 'error' })));
  }

  return { isParticles, preset, codeFor, optsOf, setOpts, setValue, onBox, layerMenu, previewItem, picker, op, add, set, setEmitter, setLook, react, infoOf, info: (id) => info.get(id) || null, OPS, PRESETS: PD.PRESETS };
})();
window.LabParticles = LabParticles;
