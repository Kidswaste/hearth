// 📜 Recipes (round 39, labrecipes): the model. No DOM, no IPC, no tokens; loads in Node for the tests
// (dev/labrecipes-test.js). A recipe is a series of Lab actions recorded on one scene (the owner's usual finishing
// steps) that replays on any other scene in one click. Steps are the meaningful, replayable actions, never mouse moves:
//   fx        an item of the effects picker applied (a filter / layer / look / palette / trigger preset / animation /
//             blend / ease, or a pack's own kind): { fx: { kind, id, name }, alt, on: ref (the selected layer) }
//   look      one of a layer's saved slider looks: { name, on: ref, vals: { key: value } }
//   palette   { colors } · trigger: { name, preset } (the bands and timing) · frame: { id, w, h }
//   formats   ▦ All formats picks: { formats } · export: the ⇪ Export panel's settings { set }
//   autopolish  ✨ Make it look finished (measured again on the scene it plays on)
//   lookmatch   🎨 a matched look: { name, grade, lens, palette } (the values, so the reference isn't needed)
//   layer     a layer added (from the gallery, or any other way): { name, code, props, from }
//   slider    a slider moved: { on: ref, key, label, group, type, v, min, max, options }
//   link      ♪ a slider's music link: { on: ref, key, label, group, min, max, link (null: off) }
//   cam       🎥 the scene's camera moves (round 40, labcamera): { moves } with times as fractions of the scene's length
// Each step has a stable `sid`. A layer reference (`on`) is { made: sid, n } when the layer was made by an earlier
// step of the recipe, else { name, sel, filter } (the layer's name, whether it was the selected one, its filter type).
// On another scene a slider step finds its slider by key, then by label, then by ROLE (glow ≈ bloom, speed ≈ tempo…,
// same kind of value); numbers keep their place in the range when the ranges differ. A step that doesn't fit is
// skipped with a note ("no slider like "Glow" here").
// The file (data/recipes/<id>.json) is portable JSON: { format: 'hearth-recipe', v: 1, id, name, at, updatedAt, from, steps }.
//   snapDiff(prev, now, { madeBy, codeOf }) → steps · compress(steps) · describe(step) · plan(recipe, scene, { has })
//   matchSlider(step, layers, made) · valueFor(step, ctl) · linkFor(step, ctl) · roleOf(label, key) · check(raw) · make(o)
//   move / drop · search · sortNewest · summary · newSid · hash
const RecipeCore = (() => {
  const FORMAT = 'hearth-recipe';
  const VERSION = 1;
  const LIMITS = { steps: 300, name: 80, code: 512 * 1024, colors: 16 };
  const KINDS = ['fx', 'look', 'palette', 'trigger', 'frame', 'formats', 'export', 'autopolish', 'lookmatch', 'layer', 'slider', 'link', 'cam', 'groups', 'mat'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const clip = (s, n) => String(s ?? '').slice(0, n);
  const norm = (s) => String(s ?? '').toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  let seq = 0;
  const newSid = () => `${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}${Math.floor(Math.random() * 1296).toString(36)}`;
  const newId = () => `r${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
  // a short fingerprint of a layer's code (a code change moves its sliders' defaults: not the owner's slider move)
  function hash(s) { s = String(s ?? ''); let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return `${s.length}:${(h >>> 0).toString(36)}`; }
  const filterType = (code) => /\bfilter\(\s*['"]([\w-]+)['"]/.exec(String(code || ''))?.[1] || null;

  // ---------- what a slider is for: its role (so "Glow amount" on one scene finds "Bloom" on another) ----------
  const ROLES = [
    ['glow', /\b(glow|bloom|glare|halo|shine|flare)/],
    ['speed', /\b(speed|tempo|rate|pace|velocity|time ?scale)/],
    ['size', /\b(size|scale|radius|width|thickness|big)/],
    ['count', /\b(count|number|density|particles|instances|copies|rings|lines)\b/],
    ['hue', /\bhue\b/],
    ['bg', /\b(background|bg|backdrop|sky|clear)\b/],
    ['color', /\b(colou?r|tint|fill|accent|primary|secondary)/],
    ['bright', /\b(bright|exposure|light|lum|gain|white)/],
    ['contrast', /\bcontrast/],
    ['sat', /\b(sat|saturation|vivid|vibran)/],
    ['grain', /\b(grain|noise|film|dust)/],
    ['blur', /\b(blur|soft|focus|bokeh|dof)/],
    ['opacity', /\b(opacity|alpha|fade|transparen)/],
    ['spin', /\b(rotat|spin|angle|twist|turn)/],
    ['camera', /\b(camera|fov|distance|orbit|zoom|dolly)/],
    ['chroma', /\b(chroma|aberration|rgb split|shift)/],
    ['vignette', /\bvignette/],
    ['strength', /\b(strength|amount|intensity|power|mix|amp|depth)/],
  ];
  function roleOf(label, key = '') {
    const t = ` ${norm(label)} ${norm(key)} `;
    for (const [r, re] of ROLES) if (re.test(t)) return r;
    return '';
  }
  const typeOf = (c) => (c?.options ? 'choice' : typeof c?.value === 'boolean' ? 'bool' : typeof c?.value === 'number' ? 'number' : typeof c?.value === 'string' && HEX.test(c.value) ? 'color' : 'text');

  // ---------- recording: what changed between two snapshots of the scene ----------
  // snapshot: { scene, palette, layers: [{ id, name, sel, filter, h }], ctl: { layerId: { key: { v, link, label, group, type, min, max, options } } } }
  // madeBy: Map(layerId → { made: sid, n }) for the layers an earlier step made · codeOf(id) → a new layer's code / props
  function refOf(L, madeBy) {
    const m = madeBy?.get?.(L.id);
    if (m) return { made: m.made, n: m.n || 0 };
    return { name: L.name, ...(L.sel ? { sel: true } : {}), ...(L.filter ? { filter: L.filter } : {}) };
  }
  function snapDiff(prev, now, { madeBy = new Map(), codeOf = null } = {}) {
    const out = [];
    if (!prev || !now || prev.scene !== now.scene) return out;
    const before = new Map((prev.layers || []).map((L) => [L.id, L]));
    for (const L of now.layers || []) {
      const P = before.get(L.id);
      if (!P) {
        // a layer that came another way than a recorded action (the gallery's hook makes its own step: madeBy)
        if (madeBy.has(L.id)) continue;
        const c = codeOf?.(L.id);
        if (!c?.code) continue;
        const sid = newSid();
        madeBy.set(L.id, { made: sid, n: 0 });
        out.push({ sid, k: 'layer', name: clip(L.name, 80), code: c.code, ...(c.props && Object.keys(c.props).length ? { props: c.props } : {}) });
        continue;
      }
      if (P.h !== L.h) continue; // its code changed: the sliders moved with it, not by hand
      const a = prev.ctl?.[L.id] || {}; const b = now.ctl?.[L.id] || {};
      for (const [key, c] of Object.entries(b)) {
        const o = a[key];
        if (!o) continue; // a slider that wasn't there before (a layer still scanning): nothing to compare with
        const base = { on: refOf(L, madeBy), key, label: clip(c.label || key, 80), ...(c.group ? { group: c.group } : {}) };
        if (!same(o.v, c.v)) {
          out.push({ sid: newSid(), k: 'slider', ...base, type: c.type || typeOf({ value: c.v, options: c.options }), v: c.v, ...(c.min != null ? { min: c.min, max: c.max } : {}), ...(c.options ? { options: c.options.slice(0, 40) } : {}) });
        }
        if (!same(o.link, c.link)) out.push({ sid: newSid(), k: 'link', ...base, ...(c.min != null ? { min: c.min, max: c.max } : {}), link: c.link ? clone(c.link) : null });
      }
    }
    if (!same(prev.palette || [], now.palette || []) && (now.palette || []).length) out.push({ sid: newSid(), k: 'palette', colors: now.palette.filter((x) => HEX.test(x)).slice(0, LIMITS.colors) });
    return out;
  }

  // ---------- one step per change: a drag session, frame sizes clicked through, the palette tried a few times ----------
  // Within a run of slider / link steps (no other step between), the same slider keeps its last move only. Frame,
  // palette, export settings and format picks in a row keep the last one.
  const target = (s) => `${s.k}|${JSON.stringify(s.on || null)}|${s.key}`;
  function compress(steps) {
    const out = [];
    let run = new Map(); // target → index in out, since the last non-slider step
    for (const s of steps || []) {
      if (s.k === 'slider' || s.k === 'link') {
        const t = target(s);
        if (run.has(t)) { out[run.get(t)] = null; }
        out.push(s); run.set(t, out.length - 1);
        continue;
      }
      run = new Map();
      const last = out.filter(Boolean).pop();
      if (last && last.k === s.k && ['frame', 'palette', 'export', 'formats', 'cam'].includes(s.k)) out[out.lastIndexOf(last)] = null;
      out.push(s);
    }
    return out.filter(Boolean);
  }

  // ---------- plain words ----------
  const LINK_HOW = { pulse: 'pulses on', follow: 'follows', step: 'steps on', random: 'jumps on' };
  function linkText(l) {
    if (!l) return 'stays still';
    const band = l.band || 'the music';
    return `${LINK_HOW[l.how] || 'follows'} the ${band}`.replace('the the', 'the');
  }
  const fmtV = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
  function onText(on) {
    if (!on) return '';
    if (on.made) return ' (on the layer it made)';
    return on.name ? ` (on ${on.name})` : '';
  }
  const FX_KIND = { layer: 'Layer', filter: 'Filter', look: 'Look', palette: 'Palette', trigger: 'Trigger preset', animate: 'Animation', ease: 'Ease', blend: 'Blend' };
  function describe(s) {
    switch (s?.k) {
      case 'fx': return `${FX_KIND[s.fx?.kind] || 'Effect'}: ${s.fx?.name || s.fx?.id}${s.alt ? ' (the other way)' : ''}${['animate', 'ease', 'blend'].includes(s.fx?.kind) ? onText(s.on) : ''}`;
      case 'look': return `Slider look "${s.name}"${onText(s.on)}`;
      case 'palette': return `Palette ${(s.colors || []).join(' ')}`;
      case 'trigger': return `Trigger preset: ${s.name}`;
      case 'frame': return `Frame size ${s.id === 'custom' && s.w ? `${s.w}×${s.h}` : s.id}`;
      case 'formats': return `▦ All formats picks: ${(s.formats || []).join(', ')}`;
      case 'export': return `⇪ Export settings: ${[s.set?.format, s.set?.size === 'custom' ? s.set?.custom : s.set?.size, s.set?.fps ? `${s.set.fps} fps` : '', s.set?.ss > 1 ? `supersample ${s.set.ss}×` : '', s.set?.blur > 1 ? `motion blur ${s.set.blur}` : ''].filter(Boolean).join(' · ')}`;
      case 'autopolish': return '✨ Make it look finished';
      case 'lookmatch': return `🎨 Look of ${s.name || 'a reference'}`;
      case 'layer': return `${s.from === 'gallery' ? 'Layer from the gallery' : 'Layer'}: ${s.name}`;
      case 'slider': return `"${s.label}" → ${fmtV(s.v)}${onText(s.on)}`;
      case 'link': return `♪ "${s.label}" ${linkText(s.link)}${onText(s.on)}`;
      case 'groups': return groupsText(s); // (round 44, layergroups)
      case 'mat': return `◉ Look: ${s.spec ? (typeof MatCore !== 'undefined' ? MatCore.describe(s.spec) : s.spec.k) : 'original'}${s.key ? ' (one part)' : ''}${s.layer ? ` on ${s.layer}` : ''}`; // (round 50, labmaterials)
      case 'cam': return (s.moves || []).length ? `Camera moves: ${s.moves.map((m) => (typeof CamCore !== 'undefined' ? CamCore.name(m) : m.kind)).join(', ')}` : 'No camera moves';
      default: return 'Step';
    }
  }
  // (round 44, layergroups) 📁 group steps: { op: group | ungroup | hide | show | rename | solo | unsolo, name, layers, to, target, kind }
  function groupsText(s) {
    const q = (x) => `"${x}"`;
    switch (s.op) {
      case 'group': return `📁 Group ${(s.layers || []).map(q).join(', ')}${s.name ? ` as ${q(s.name)}` : ''}`;
      case 'ungroup': return `Ungroup ${q(s.name)}`;
      case 'hide': return `Hide the group ${q(s.name)}`;
      case 'show': return `Show the group ${q(s.name)}`;
      case 'rename': return `Rename the group ${q(s.name)} to ${q(s.to)}`;
      case 'solo': return `Only ${s.kind === 'group' ? 'the group ' : ''}${q(s.target)} shows (solo)`;
      case 'unsolo': return 'Every layer shows (solo off)';
      default: return 'Group step';
    }
  }
  const ICON = { groups: '📁', fx: '✦', look: '◑', palette: '🎨', trigger: '⚡', frame: '▭', formats: '▦', export: '⇪', autopolish: '✨', lookmatch: '🎨', layer: '＋', slider: '⇆', link: '♪', cam: '🎥', mat: '◉' };
  const icon = (s) => ICON[s?.k] || '•';
  function summary(r) {
    const steps = r?.steps || [];
    const n = steps.length;
    const by = {};
    for (const s of steps) by[s.k] = (by[s.k] || 0) + 1;
    const W = { fx: ['effect', 'effects'], slider: ['slider', 'sliders'], link: ['music link', 'music links'], layer: ['layer', 'layers'], look: ['look', 'looks'], palette: ['palette', 'palettes'], frame: ['frame size', 'frame sizes'], trigger: ['trigger preset', 'trigger presets'], autopolish: ['polish', 'polishes'], lookmatch: ['look match', 'look matches'], export: ['export setting', 'export settings'], formats: ['format pick', 'format picks'], groups: ['group step', 'group steps'] };
    const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => `${c} ${W[k]?.[c === 1 ? 0 : 1] || k}`);
    return `${n} step${n === 1 ? '' : 's'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
  }

  // ---------- replaying: finding a step's slider on another scene ----------
  // layers: [{ id, name, sel, filter, ctls: [{ key, label, group, type, value, min, max, options }] }] · made: Map(sid → [layer ids])
  // → { layer, ctl, how: 'key' | 'label' | 'role', score } or { why }
  function candidates(on, layers, made) {
    if (on?.made) {
      const ids = made?.get?.(on.made);
      if (!ids) return { why: 'its layer wasn\'t made (that step was skipped or removed)' };
      const L = layers.find((x) => x.id === ids[on.n || 0]) || layers.find((x) => ids.includes(x.id));
      return L ? { list: [[L, 30]] } : { why: 'its layer is gone' };
    }
    const n = norm(on?.name);
    // a step recorded on a layer the scene already had never lands on a layer this recipe just made
    const mine = new Set([...(made?.values?.() || [])].flat());
    const pool = layers.filter((L) => !mine.has(L.id));
    const list = (pool.length ? pool : layers).map((L) => [L, (n && norm(L.name) === n ? 30 : 0) + (on?.filter && L.filter === on.filter ? 20 : 0) + (L.sel ? (on?.sel ? 12 : 6) : 0)]);
    return { list: list.sort((a, b) => b[1] - a[1]) };
  }
  function matchSlider(step, layers, made = new Map()) {
    const c = candidates(step.on, layers || [], made);
    if (c.why) return { why: c.why };
    const want = { key: step.key, label: norm(step.label), role: roleOf(step.label, step.key), type: step.type || (step.k === 'link' ? 'number' : '') };
    let best = null;
    for (const [L, lw] of c.list) {
      for (const x of L.ctls || []) {
        const t = x.type || typeOf(x);
        if (want.type && t !== want.type) continue;
        let s = 0; let how = '';
        if (x.key === want.key) { s = 100; how = 'key'; } else if (want.label && norm(x.label) === want.label) { s = 90; how = 'label'; } else if (want.role && roleOf(x.label, x.key) === want.role) { s = 50 + (step.group && x.group === step.group ? 10 : 0); how = 'role'; }
        if (!s) continue;
        if (step.k === 'slider' && t === 'choice' && !(x.options || []).includes(step.v)) continue;
        const score = s + lw;
        if (!best || score > best.score) best = { layer: L, ctl: x, how, score };
      }
    }
    if (!best) return { why: `no slider like "${step.label}" here` };
    return best;
  }
  // a number keeps its place in the range when the slider found has another range (or was found by its role)
  function valueFor(step, ctl) {
    const v = step.v;
    if (typeof v !== 'number' || ctl.min == null || ctl.max == null) return v;
    const inRange = v >= ctl.min && v <= ctl.max;
    if (step.min == null || step.max == null || (step.min === ctl.min && step.max === ctl.max && inRange)) return Math.min(ctl.max, Math.max(ctl.min, v));
    const f = step.max > step.min ? (v - step.min) / (step.max - step.min) : 0.5;
    const out = ctl.min + Math.min(1, Math.max(0, f)) * (ctl.max - ctl.min);
    return ctl.step === 1 ? Math.round(out) : Math.round(out * 1e4) / 1e4;
  }
  // a ♪ link's range (lo / hi) moved into the found slider's range the same way
  function linkFor(step, ctl) {
    const l = step.link ? clone(step.link) : null;
    if (!l) return null;
    for (const k of ['lo', 'hi']) if (typeof l[k] === 'number') l[k] = valueFor({ v: l[k], min: step.min, max: step.max }, ctl);
    return l;
  }

  // ---------- the preview before replaying: which steps fit this scene ----------
  // scene: { layers (as matchSlider), looks: { layerId: [names] }, frame, palette } · has(fx) → bool (the effect exists here)
  // → [{ sid, ok, why, where }] in order (a step on a layer made by a step that fits counts as fitting)
  function plan(recipe, scene, { has = () => true } = {}) {
    const out = [];
    const made = new Map();
    const layers = scene?.layers || [];
    for (const s of recipe?.steps || []) {
      let ok = true; let why = ''; let where = '';
      if (s.k === 'fx') {
        if (!has(s.fx)) { ok = false; why = `"${s.fx?.name || s.fx?.id}" isn't in this Hearth`; } else if (['animate', 'ease', 'blend'].includes(s.fx?.kind)) {
          const c = candidates(s.on, layers, made);
          if (c.why) { ok = false; why = c.why; } else if (!c.list.length) { ok = false; why = 'no layer to put it on'; } else where = c.list[0][0].name || '';
        }
      } else if (s.k === 'look') {
        const c = s.on?.made && made.has(s.on.made) ? { list: [] } : candidates(s.on, layers, made);
        if (s.on?.made && made.has(s.on.made)) where = 'the new layer';
        else if (c.why) { ok = false; why = c.why; } else {
          const L = c.list.find(([x]) => (scene.looks?.[x.id] || []).some((n) => norm(n) === norm(s.name)))?.[0];
          if (L) where = L.name; else {
            const hits = Object.entries(s.vals || {}).filter(([key, v]) => matchSlider({ k: 'slider', on: s.on, key, label: s.labels?.[key] || key, v, type: '' }, layers, made).ctl);
            if (hits.length) where = `${hits.length} of its values by name`; else { ok = false; why = `no look "${s.name}" and none of its sliders here`; }
          }
        }
      } else if (s.k === 'slider' || s.k === 'link') {
        if (s.on?.made && made.has(s.on.made)) where = 'the new layer';
        else {
          const m = matchSlider(s, layers, made);
          if (m.why) { ok = false; why = m.why; } else where = `${m.ctl.label}${m.layer.name ? ` on ${m.layer.name}` : ''}${m.how === 'role' ? ' (same role)' : ''}`;
        }
      } else if (s.k === 'frame') {
        if (scene?.frame && scene.frame === s.id && s.id !== 'custom') where = 'already this size';
      } else if (s.k === 'groups') { // (round 44) layers by name; groups are made or named by earlier steps, checked when it runs
        const names = s.op === 'group' ? s.layers || [] : s.op === 'solo' && s.kind === 'layer' ? [s.target] : [];
        const hits = names.filter((n) => layers.some((L) => norm(L.name) === norm(n)));
        if (names.length && !hits.length) { ok = false; why = `no layer like ${names.map((n) => `"${n}"`).join(', ')} here`; } else if (names.length) where = hits.length < names.length ? `${hits.length} of ${names.length} layers` : '';
      }
      if (ok && (s.k === 'layer' || (s.k === 'fx' && ['layer', 'filter', 'look'].includes(s.fx?.kind)) || s.k === 'lookmatch')) made.set(s.sid, ['(new)']);
      out.push({ sid: s.sid, ok, why, where });
    }
    // steps on a layer the recipe makes: fine once that step fits (the real check happens when it runs)
    return out;
  }

  // ---------- the file ----------
  function cleanStep(s) {
    if (!s || typeof s !== 'object' || !KINDS.includes(s.k)) return null;
    const o = clone(s);
    o.sid = typeof o.sid === 'string' && /^[\w-]{1,40}$/.test(o.sid) ? o.sid : newSid();
    if (o.code != null && (typeof o.code !== 'string' || o.code.length > LIMITS.code)) return null;
    if (o.k === 'layer' && !o.code) return null;
    if (o.k === 'fx' && !(o.fx?.kind && o.fx?.id != null)) return null;
    if ((o.k === 'slider' || o.k === 'link') && !o.key) return null;
    if (o.k === 'cam' && !Array.isArray(o.moves)) return null;
    if (o.k === 'mat' && (o.spec != null && (typeof o.spec !== 'object' || typeof o.spec.k !== 'string'))) return null; // (round 50, labmaterials)
    if (o.k === 'groups' && !['group', 'ungroup', 'hide', 'show', 'rename', 'solo', 'unsolo'].includes(o.op)) return null;
    if (o.k === 'groups' && o.layers) o.layers = (Array.isArray(o.layers) ? o.layers : []).slice(0, 64).map((n) => clip(n, 120));
    if (o.k === 'palette') { o.colors = (o.colors || []).filter((c) => HEX.test(c)).slice(0, LIMITS.colors); if (!o.colors.length) return null; }
    if (o.on && typeof o.on !== 'object') delete o.on;
    if (o.name != null) o.name = clip(o.name, 120);
    if (o.label != null) o.label = clip(o.label, 120);
    return o;
  }
  const safeName = (s) => clip(String(s ?? '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim(), LIMITS.name) || 'My recipe';
  function make({ name, steps, from = '', id = null, at = null } = {}) {
    const now = Date.now();
    return { format: FORMAT, v: VERSION, id: id || newId(), name: safeName(name), at: at || now, updatedAt: now, from: clip(from, 80), steps: (steps || []).map(cleanStep).filter(Boolean).slice(0, LIMITS.steps) };
  }
  // a recipe as read (a file, a pack): → { ok, problems, r }
  function check(raw) {
    const problems = [];
    if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) return { ok: false, problems: ['Not a Hearth recipe.'], r: null };
    if (Number(raw.v) > VERSION) problems.push('It was made by a newer Hearth.');
    if (!Array.isArray(raw.steps)) problems.push('It has no steps.');
    else if (raw.steps.length > LIMITS.steps) problems.push(`It has ${raw.steps.length} steps: the most is ${LIMITS.steps}.`);
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).slice(0, LIMITS.steps).map(cleanStep).filter(Boolean);
    if (Array.isArray(raw.steps) && raw.steps.length && !steps.length) problems.push('None of its steps can be used.');
    const r = { format: FORMAT, v: VERSION, id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : newId(), name: safeName(raw.name), at: Number(raw.at) || Date.now(), updatedAt: Number(raw.updatedAt) || Number(raw.at) || Date.now(), from: clip(raw.from, 80), steps };
    return { ok: !problems.length, problems, r };
  }

  // ---------- editing ----------
  function move(steps, i, d) {
    const a = (steps || []).slice();
    const j = i + d;
    if (i < 0 || i >= a.length || j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  }
  const drop = (steps, i) => (steps || []).filter((_, k) => k !== i);
  // steps that point at a layer a removed / later step makes (after an edit): listed so the picker can say so
  function orphans(steps) {
    const seen = new Set(); const out = [];
    for (const s of steps || []) { if (s.on?.made && !seen.has(s.on.made)) out.push(s.sid); seen.add(s.sid); }
    return out;
  }

  // ---------- the list ----------
  const sortNewest = (list) => (list || []).slice().sort((a, b) => (b.updatedAt || b.at || 0) - (a.updatedAt || a.at || 0));
  function search(list, q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return sortNewest(list);
    return sortNewest(list).filter((r) => { const t = norm(`${r.name} ${r.from} ${(r.steps || []).map(describe).join(' ')}`); return words.every((w) => t.includes(w)); });
  }

  return { FORMAT, VERSION, LIMITS, KINDS, ROLES, roleOf, typeOf, refOf, snapDiff, compress, describe, linkText, icon, summary, candidates, matchSlider, valueFor, linkFor, plan,
    make, check, cleanStep, safeName, move, drop, orphans, search, sortNewest, newSid, newId, hash, filterType, norm };
})();
if (typeof module !== 'undefined') module.exports = RecipeCore;
