// 🎛 Mood dials (round 135, mooddial135), the pure part: loads in the Lab (lazy group "dials") and in Node.
// docs/upgrades/mooddial135.md. A dial is ONE scene-wide knob (0 → 1) that moves many sliders across layers, each
// mapping with its own range (a at 0, b at 1, an optional m at ½: "the scene as it is sits in the middle") and curve.
//   data (saved with the scene: sketch.dials) = { v: 1, sel, list: [{ id, name, value, maps: [map], keys: [{ t, v, ease }], follow }] }
//   map = { layer, key, label, kind: 'number' | 'color', a, b, m?, curve: linear | ease | in | out, min?, max?, int? }
//   · valueOf(map, d) / setOf(dial, d): what the sliders are at d → { layerId: { key: value } }
//   · estimate(dial, read): where the dial sits now, from the sliders (so the card never lies after a reload)
//   · learn(lo, hi, controls): two snapshots of the sliders (the 0 end, the 1 end) → the maps (Learn)
//   · suggestLocal(controls): Energy / Darkness / Chaos / Warmth from the slider names (free, no AI)
//   · suggestPrompt / parseSuggest: the ✦ Suggest pass (one small helper run, cost first), checked and clamped
//   · bake(dial, existing): the dial's keys → keys on each mapped slider, tagged { dial: id } (so renders, the
//     sequence and the backstage play it with nothing new), never over the owner's own slider keys
const DialsCore = (() => {
  const MAX = 4; const MAX_MAPS = 12;
  const CURVES = ['linear', 'ease', 'in', 'out'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const r5 = (x) => Number(Number(x).toPrecision(5));
  const r3 = (t) => Math.round(t * 1000) / 1000;
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  // ---------- colors ----------
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
  function mix(a, b, u) {
    if (!HEX.test(a || '') || !HEX.test(b || '')) return HEX.test(a || '') ? a.toLowerCase() : b;
    const A = rgb(a); const B = rgb(b);
    return hex(A.map((x, i) => x + (B[i] - x) * u));
  }

  // ---------- one mapping ----------
  function curve(c, u) {
    u = clamp01(u);
    if (c === 'ease') return u * u * (3 - 2 * u);
    if (c === 'in') return u * u;
    if (c === 'out') return 1 - (1 - u) * (1 - u);
    return u;
  }
  function lerp(m, x, y, u) {
    if (m.kind === 'color') return mix(x, y, u);
    const v = Number(x) + (Number(y) - Number(x)) * u;
    if (m.int) return Math.round(v);
    const lo = m.min ?? -Infinity; const hi = m.max ?? Infinity;
    return r5(Math.max(lo, Math.min(hi, v)));
  }
  // the slider's value with the dial at d (0..1)
  function valueOf(m, d) {
    d = clamp01(d);
    if (m.m != null) return d < 0.5 ? lerp(m, m.a, m.m, curve(m.curve, d * 2)) : lerp(m, m.m, m.b, curve(m.curve, (d - 0.5) * 2));
    return lerp(m, m.a, m.b, curve(m.curve, d));
  }
  // every mapped slider at d, by layer
  function setOf(dial, d) {
    const out = {};
    for (const m of dial?.maps || []) (out[m.layer] ||= {})[m.key] = valueOf(m, d);
    return out;
  }
  // where the dial sits, read from the sliders (numbers only; none readable: its stored value)
  function estimate(dial, read) {
    const nums = (dial?.maps || []).filter((m) => m.kind !== 'color' && Number(m.a) !== Number(m.b));
    if (!nums.length) return clamp01(dial?.value ?? 0.5);
    let best = clamp01(dial?.value ?? 0.5); let err = Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const d = i / 100; let e = 0; let n = 0;
      for (const m of nums) { const v = Number(read(m.layer, m.key)); if (!Number.isFinite(v)) continue; const span = Math.abs(Number(m.b) - Number(m.a)) || 1; e += ((valueOf(m, d) - v) / span) ** 2; n += 1; }
      if (!n) return best;
      if (e < err - 1e-12) { err = e; best = d; }
    }
    return best;
  }

  // ---------- the scene's dials ----------
  const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function normMap(m) {
    if (!m || m.layer == null || !m.key) return null;
    const kind = m.kind === 'color' ? 'color' : 'number';
    const ok = (x) => (kind === 'color' ? HEX.test(String(x)) : Number.isFinite(Number(x)));
    if (!ok(m.a) || !ok(m.b)) return null;
    const out = { layer: String(m.layer), key: String(m.key), label: String(m.label || m.key).slice(0, 60), kind, a: kind === 'color' ? String(m.a).toLowerCase() : Number(m.a), b: kind === 'color' ? String(m.b).toLowerCase() : Number(m.b), curve: CURVES.includes(m.curve) ? m.curve : 'linear' };
    if (m.m != null && ok(m.m)) out.m = kind === 'color' ? String(m.m).toLowerCase() : Number(m.m);
    if (kind === 'number') { if (Number.isFinite(m.min)) out.min = m.min; if (Number.isFinite(m.max)) out.max = m.max; if (m.int) out.int = true; }
    if (m.layerName) out.layerName = String(m.layerName).slice(0, 60);
    return out;
  }
  function normKeys(keys) {
    return (Array.isArray(keys) ? keys : []).filter((k) => Number.isFinite(k?.t) && Number.isFinite(k?.v)).map((k) => ({ t: r3(Math.max(0, k.t)), v: r5(clamp01(k.v)), ease: ['linear', 'ease', 'hold'].includes(k.ease) ? k.ease : 'ease' })).sort((a, b) => a.t - b.t);
  }
  function normDial(x, i = 0) {
    if (!x || typeof x !== 'object') return null;
    const maps = (Array.isArray(x.maps) ? x.maps : []).map(normMap).filter(Boolean).slice(0, 40);
    return { id: String(x.id || `d${i + 1}`), name: String(x.name || `Dial ${i + 1}`).slice(0, 24), value: clamp01(x.value ?? 0.5), maps, keys: normKeys(x.keys), baked: (Array.isArray(x.baked) ? x.baked : []).filter((b) => typeof b === 'string').slice(0, 60), follow: x.follow && typeof x.follow === 'object' ? x.follow : null };
  }
  function norm(data) {
    const list = (Array.isArray(data?.list) ? data.list : []).map(normDial).filter(Boolean).slice(0, MAX);
    const seen = new Set(); for (const d of list) { while (seen.has(d.id)) d.id += 'x'; seen.add(d.id); }
    return { v: 1, sel: list.some((d) => d.id === data?.sel) ? data.sel : list[0]?.id || null, list };
  }
  const newId = (data) => { let n = (data?.list?.length || 0) + 1; while (data?.list?.some((d) => d.id === `d${n}`)) n += 1; return `d${n}`; };
  const find = (data, q) => {
    const list = data?.list || []; const s = words(q);
    if (q != null && /^\d+$/.test(String(q)) && list[Number(q) - 1]) return list[Number(q) - 1];
    return list.find((d) => d.id === q) || list.find((d) => words(d.name) === s) || list.find((d) => s && words(d.name).includes(s)) || null;
  };
  function describe(dial) {
    const L = new Set((dial?.maps || []).map((m) => m.layer));
    const n = dial?.maps?.length || 0;
    return `${n} slider${n === 1 ? '' : 's'}${L.size > 1 ? ` on ${L.size} layers` : ''}`;
  }

  // ---------- Learn: the sliders at one end, then at the other ----------
  // lo / hi: { layerId: { key: value } } read with the dial at 0 and at 1; controls: [{ layer, key, label, kind, min, max, int }]
  // keep: the dial's maps already there (their ends are replaced by what was read; a slider that no longer moves stays)
  function learn(lo, hi, controls, keep = []) {
    const out = []; const seen = new Set();
    for (const c of controls) {
      if (c.kind !== 'number' && c.kind !== 'color') continue;
      const a = lo?.[c.layer]?.[c.key]; const b = hi?.[c.layer]?.[c.key];
      if (a === undefined || b === undefined) continue;
      const was = keep.find((m) => m.layer === c.layer && m.key === c.key);
      if (JSON.stringify(a) === JSON.stringify(b) && !was) continue;
      const m = normMap({ layer: c.layer, layerName: c.layerName, key: c.key, label: c.label, kind: c.kind, a, b, curve: was?.curve || 'linear', min: c.min, max: c.max, int: c.int });
      if (m) { out.push(m); seen.add(`${c.layer}|${c.key}`); }
    }
    for (const m of keep) if (!seen.has(`${m.layer}|${m.key}`)) out.push(m);
    return out;
  }

  // ---------- local suggestions from the names (free) ----------
  // [regex on "key label", direction (+1: up at the dial's 1 end), strength]
  const RULES = {
    Energy: [
      [/speed|rate|spin|tempo|flow|drift|orbit|travel|freq|pace|motion/, 1, 0.7],
      [/intens|glow|bloom|emiss|strength|power|energy|bright|exposure|pulse|punch|amount|gain/, 1, 0.7],
      [/count|density|particles|spawn|burst/, 1, 0.5],
      [/shake|jitter|bounce|wobble/, 1, 0.5],
    ],
    Darkness: [
      [/bright|exposure|light|glow|bloom|emiss|lumin|gamma|ambient|white/, -1, 0.7],
      [/contrast|vignette|shadow|dark|fog|black|gloom/, 1, 0.7],
      [/satur|vivid/, -1, 0.4],
    ],
    Chaos: [
      [/noise|distort|warp|jitter|glitch|turb|chaos|random|displace|wobble|shake|scatter|spread|rough|wave|amp|bend|twist|rgb|split/, 1, 0.75],
      [/speed|spin|rate/, 1, 0.3],
      [/smooth|calm|order|damp|steady|blur/, -1, 0.5],
    ],
    Warmth: [
      [/warm|temp/, 1, 0.7],
      [/satur|vivid/, 1, 0.3],
    ],
  };
  const COOL = '#3d7bff'; const WARM = '#ff8a3d'; const DARK = '#000000';
  function numMap(c, dir, k) {
    const lo = Number(c.min); const hi = Number(c.max); const v = Number(c.value);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo) || !Number.isFinite(v)) return null;
    const down = v - (v - lo) * k; const up = v + (hi - v) * k;
    const [a, b] = dir > 0 ? [down, up] : [up, down];
    const r = (x) => (c.int ? Math.round(x) : r5(x));
    if (Math.abs(r(a) - r(b)) < (hi - lo) * 0.02) return null;
    return normMap({ layer: c.layer, layerName: c.layerName, key: c.key, label: c.label, kind: 'number', a: r(a), m: r(v), b: r(b), curve: 'linear', min: lo, max: hi, int: c.int });
  }
  function suggestLocal(controls, { have = [] } = {}) {
    const usable = (controls || []).filter((c) => c.live !== false && (c.kind === 'number' || c.kind === 'color'));
    const taken = new Set(have.map((n) => words(n)));
    const out = [];
    for (const [name, rules] of Object.entries(RULES)) {
      if (taken.has(words(name))) continue;
      const maps = [];
      for (const c of usable) {
        if (c.kind === 'color') {
          const v = String(c.value || '').toLowerCase(); if (!HEX.test(v)) continue;
          if (name === 'Warmth') maps.push(normMap({ layer: c.layer, layerName: c.layerName, key: c.key, label: c.label, kind: 'color', a: mix(v, COOL, 0.45), m: v, b: mix(v, WARM, 0.45), curve: 'linear' }));
          else if (name === 'Darkness' && /bg|back|sky|fog|ambient|base|floor|light|glow/.test(words(`${c.key} ${c.label}`))) maps.push(normMap({ layer: c.layer, layerName: c.layerName, key: c.key, label: c.label, kind: 'color', a: mix(v, '#ffffff', 0.15), m: v, b: mix(v, DARK, 0.6), curve: 'linear' }));
          continue;
        }
        const nm = words(`${c.key} ${c.label}`);
        const rule = rules.find(([re]) => re.test(nm));
        if (!rule) continue;
        const m = numMap(c, rule[1], rule[2]);
        if (m) maps.push(m);
      }
      const list = maps.filter(Boolean).slice(0, MAX_MAPS);
      if (list.length) out.push({ name, maps: list, why: `From the names: ${list.slice(0, 4).map((m) => `${m.label} ${dirWord(m)}`).join(', ')}${list.length > 4 ? ` +${list.length - 4}` : ''}` });
    }
    return out.slice(0, MAX); // (Energy, Darkness, Chaos, Warmth: in that order)
  }
  const dirWord = (m) => (m.kind === 'color' ? '◐' : Number(m.b) > Number(m.a) ? '↑' : '↓');

  // ---------- ✦ Suggest: one small helper pass (cost first) ----------
  const HEAD = '✦ Suggest mood dials for this Lab scene.';
  const PERSONA = 'You are a careful music-visuals assistant. Answer with JSON only.';
  const lineOf = (c) => `[${c.layerName || c.layer}] ${c.key} "${c.label || c.key}" ${c.kind === 'color' ? c.value : r5(c.value)}${c.kind === 'number' ? ` (${r5(c.min)}–${r5(c.max)})` : ' (color)'}`;
  function suggestPrompt(controls, { have = [] } = {}) {
    const list = (controls || []).filter((c) => c.live !== false && (c.kind === 'number' || c.kind === 'color')).slice(0, 120);
    return [HEAD,
      'A mood dial is one knob (0 → 1) that moves several sliders across layers at once, like Energy, Darkness, Chaos or Warmth.',
      have.length ? `The scene has these dials already: ${have.join(', ')}. Suggest others.` : '',
      'The sliders ([layer] key "label" now (min–max)):',
      ...list.map(lineOf),
      'Answer with JSON only: {"dials":[{"name":"Energy","why":"a few words","maps":[{"layer":"<layer>","key":"<key>","at0":<value at 0>,"at1":<value at 1>,"curve":"linear|ease|in|out"}]}]}.',
      '3 or 4 dials, 2 to 8 sliders each. at0 and at1 within each slider\'s range; colors as "#rrggbb". Let the scene as it is sit near the middle of each dial.'].filter(Boolean).join('\n');
  }
  function parseSuggest(text, controls) {
    let j = null;
    const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    try { j = JSON.parse(s.slice(a, b + 1)); } catch { j = null; }
    const dials = Array.isArray(j?.dials) ? j.dials : [];
    const byKey = (layer, key) => (controls || []).find((c) => (c.layer === layer || words(c.layerName) === words(layer)) && c.key === key) || null;
    let dropped = 0;
    const out = dials.slice(0, MAX).map((d) => {
      const maps = (Array.isArray(d?.maps) ? d.maps : []).map((m) => {
        const c = byKey(m?.layer, m?.key);
        if (!c || (c.kind !== 'number' && c.kind !== 'color')) { dropped += 1; return null; }
        let x = m.at0; let y = m.at1;
        if (c.kind === 'number') {
          x = Number(x); y = Number(y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) { dropped += 1; return null; }
          const cl = (v) => { v = Math.max(c.min, Math.min(c.max, v)); return c.int ? Math.round(v) : r5(v); };
          x = cl(x); y = cl(y);
        } else if (!HEX.test(String(x)) || !HEX.test(String(y))) { dropped += 1; return null; }
        if (x === y) { dropped += 1; return null; }
        return normMap({ layer: c.layer, layerName: c.layerName, key: c.key, label: c.label, kind: c.kind, a: x, b: y, curve: m.curve, min: c.min, max: c.max, int: c.int });
      }).filter(Boolean).slice(0, MAX_MAPS);
      return maps.length ? { name: String(d.name || 'Dial').slice(0, 24), why: String(d.why || '').slice(0, 120), maps } : null;
    }).filter(Boolean);
    return { dials: out, dropped };
  }
  const estimateCost = (prompt, out = 450) => ({ input: Math.round(900 + String(prompt || '').length / 3.6), output: out });
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude', model = '') => `About ${kfmt(c.input)} tokens in and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''} (the cheapest helper)`;

  // ---------- keys: the dial's lane, and its keys baked onto the sliders ----------
  function dialAt(keys, t, base = 0.5) {
    if (!keys?.length || t == null) return base;
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    let i = 0; while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
    const a = keys[i]; const b = keys[i + 1];
    if (a.ease === 'hold') return a.v;
    let u = (t - a.t) / (b.t - a.t || 1);
    if (a.ease === 'ease') u = u * u * (3 - 2 * u);
    return a.v + (b.v - a.v) * u;
  }
  function upsert(keys, t, v, ease = 'ease') {
    const r = r3(Math.max(0, t));
    const next = (keys || []).filter((k) => Math.abs(k.t - r) >= 0.01).map((k) => ({ ...k }));
    const was = (keys || []).find((k) => Math.abs(k.t - r) < 0.01);
    next.push({ t: r, v: r5(clamp01(v)), ease: was?.ease || ease });
    return next.sort((a, b) => a.t - b.t);
  }
  const SUB = 4; // a curved move is sampled 4 times a segment, so the preview and renders follow the dial's own curve
  // existing: { 'layer|key': [slider keys] } → { set: { layer: { 's:key': keys | [] } }, skipped: [maps] }
  function bake(dial, existing = {}) {
    const keys = normKeys(dial?.keys);
    const set = {}; const skipped = [];
    for (const m of dial?.maps || []) {
      const have = existing[`${m.layer}|${m.key}`] || [];
      const own = have.filter((k) => k.dial !== dial.id);
      if (own.length) { if (keys.length) skipped.push(m); continue; } // the owner's keys (or another dial's) win
      const curved = m.curve !== 'linear' || m.m != null || m.kind === 'color';
      const out = [];
      keys.forEach((k, i) => {
        const nx = keys[i + 1];
        if (k.ease === 'hold' || !nx) { out.push({ t: k.t, v: valueOf(m, k.v), ease: k.ease === 'hold' ? 'hold' : 'linear', dial: dial.id }); return; }
        if (!curved && k.ease === 'linear') { out.push({ t: k.t, v: valueOf(m, k.v), ease: 'linear', dial: dial.id }); return; }
        for (let j = 0; j < SUB; j += 1) { const t = k.t + ((nx.t - k.t) * j) / SUB; out.push({ t: r3(t), v: valueOf(m, dialAt(keys, t)), ease: 'linear', dial: dial.id }); }
      });
      if (!out.length && !have.length) continue;
      (set[m.layer] ||= {})[`s:${m.key}`] = out;
    }
    return { set, skipped };
  }
  // the slider keys a dial once baked but no longer maps (a map removed): emptied
  function unbake(dialId, existing = {}, keepMaps = []) {
    const set = {};
    for (const [lk, ks] of Object.entries(existing)) {
      if (!ks.some((k) => k.dial === dialId)) continue;
      const [layer, key] = lk.split('|');
      if (keepMaps.some((m) => m.layer === layer && m.key === key)) continue;
      (set[layer] ||= {})[`s:${key}`] = ks.filter((k) => k.dial !== dialId);
    }
    return set;
  }

  const api = { MAX, MAX_MAPS, CURVES, HEAD, PERSONA, mix, curve, valueOf, setOf, estimate, norm, normMap, normDial, newId, find, describe, learn, suggestLocal, suggestPrompt, parseSuggest, estimateCost, costLine, dialAt, upsert, bake, unbake, clone, dirWord };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
if (typeof window !== 'undefined') window.DialsCore = DialsCore;
