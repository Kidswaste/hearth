// ✦ Explain this layer (round 132, explain132): the pure part, no DOM (loads in Node; tools/three-explain.js is the
// window side, dev/fake-common.js answers its two prompts for dev/checks/explain132.js).
// Two small AI passes, each only on the owner's click, on the cheapest helper (hub.askOnce, a lean run, like the brief):
//   1. "Explain this Lab layer": the layer's code (numbered) and its sliders → JSON
//        { what: '2–4 plain lines', parts: [{ lines: '12–18', does }], sliders: [{ key, why }],
//          hardcoded: [{ line, text, label, key, min, max, why }] }
//      checked against the code (a hard-coded value must really be on its line) and cached per layer by a code hash
//   2. "Tweak this Lab layer": the owner's "Make it…" words, the sliders (with ranges), the keyed properties and the
//      song's sections → JSON { set: { key: value }, keys: [{ property, keys: [{ time, value }] }], say } (applied here,
//      clamped, one undo step) or { director: 'message' } (sent to the director as the owner's message)
// "Turn into a slider": sliderEdit(code, item) puts a hard-coded value into the layer's tweak() (one code edit).
// Cache: kv 'three-explain' { v: 1, list: [{ id: <layer id>, hash, at, by, data }] } (the last 3 codes of a layer, MAX in all)
const ExplainCore = (() => {
  const STORE = 'three-explain';
  const MAX = 90; // explanations kept in the cache (3 codes per layer at most)
  const CODE_MAX = 14000; // characters of code sent (≈ 3.5k tokens); a longer layer is cut with a note
  const HEAD = 'Explain this Lab layer';
  const THEAD = 'Tweak this Lab layer';
  const PERSONA = 'You explain three.js music-visual layers to a musician who does not code. Plain words, short, concrete. Reply with JSON only.';
  const ANIM = ['opacity', 'x', 'y', 'scale', 'rotate'];
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const secret = (s) => (typeof AccessRules !== 'undefined' && AccessRules.redact ? AccessRules.redact(String(s ?? '')) : String(s ?? '')).replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,})/g, '•••');

  // ---------- the code's hash (the cache key) ----------
  function hash(code) {
    const s = String(code ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `${h.toString(16).padStart(8, '0')}-${s.length}`;
  }
  const numbered = (code) => String(code ?? '').split('\n').map((ln, k) => `${String(k + 1).padStart(4)}| ${ln}`).join('\n');
  const sliderLine = (s) => `${s.key}${s.label && String(s.label).toLowerCase() !== String(s.key).toLowerCase() ? ` "${cap(s.label, 24)}"` : ''} ${typeof s.value === 'number' ? r3(s.value) : cap(JSON.stringify(s.value), 14)}${num(s.min) != null && num(s.max) != null ? ` (${r3(s.min)}–${r3(s.max)})` : ''}`;

  // ---------- 1. the explanation ----------
  // x = { name, code, sliders: [{ key, label, value, min, max }] }
  function explainPrompt(x) {
    let code = numbered(x.code);
    const cut = code.length > CODE_MAX;
    if (cut) code = `${code.slice(0, CODE_MAX)}\n…(cut: the layer is longer)`;
    const sl = (x.sliders || []).filter((s) => s.key != null).slice(0, 24);
    return secret([
      `${HEAD} "${cap(x.name || 'layer', 48)}" to its owner, a musician who doesn't code.`,
      `Its sliders (tweak()): ${sl.length ? sl.map(sliderLine).join(', ') : 'none yet'}.`,
      '', 'The code, numbered:', code, '',
      'Reply with JSON only:',
      '{"what":"2–4 short plain lines: what it draws and how it moves (e.g. a ring of 40 glowing spheres orbiting, pulsing on the kick)",',
      ' "parts":[{"lines":"12–18","does":"one line: what this part controls"}] (the 3–7 important parts, in order),',
      ' "sliders":[{"key":"<slider key>","why":"what it changes, in a few words"}] (the 2–4 that matter most, best first),',
      ' "hardcoded":[{"line":<line number>,"text":"<the value exactly as written on that line, e.g. 40 or 0.35 or \'#ff3cac\'>","label":"plain name","key":"camelCaseKey","min":<n>,"max":<n>,"why":"what it would control"}] (up to 4 fixed numbers or colours worth a slider; not values already in tweak())}',
    ].join('\n'));
  }
  const IDENT = /^[A-Za-z_$][\w$]*$/;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // where a literal sits on a line: as its own token (not part of a longer number or name)
  const tokenRe = (text) => new RegExp(`(?<![\\w.$#])${esc(text)}(?![\\w.])`);
  // the literal to replace for a value: a colour quoted or not ('#ff3cac', "#ff3cac", 0xff3cac), else the number's token
  function matcher(text) {
    const t = String(text).trim();
    const hex = (t.match(/^['"`]?#([0-9a-f]{6})['"`]?$/i) || t.match(/^0x([0-9a-f]{6})$/i) || [])[1];
    if (hex) return /^0x/i.test(t) ? new RegExp(`(?<![\\w.])0x${hex}(?![\\w])`, 'i') : new RegExp(`(['"\`])#${hex}\\1`, 'i');
    return tokenRe(t);
  }
  // the lines a tweak({ … }) call covers (its values are sliders already)
  function tweakSpan(lines) {
    const out = new Set();
    lines.forEach((ln, i) => {
      if (!/\btweak\s*\(\s*\{/.test(ln)) return;
      let depth = 0;
      for (let k = i; k < lines.length && k < i + 60; k += 1) {
        out.add(k);
        for (const ch of lines[k].slice(k === i ? lines[k].search(/\btweak\s*\(/) : 0)) { if (ch === '(') depth += 1; else if (ch === ')') depth -= 1; }
        if (depth <= 0) break;
      }
    });
    return out;
  }
  // the hard-coded value as a slider's starting value: a number, or a colour '#rrggbb'
  function valueOf(text) {
    const t = String(text).trim().replace(/^['"`]|['"`]$/g, '');
    if (/^#[0-9a-f]{6}$/i.test(t)) return { kind: 'color', value: t.toLowerCase() };
    if (/^0x[0-9a-f]{6}$/i.test(t)) return { kind: 'color', value: `#${t.slice(2).toLowerCase()}` };
    const n = Number(t);
    return Number.isFinite(n) && /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t) ? { kind: 'number', value: n } : null;
  }
  function rangeFor(v, min, max) {
    let lo = num(min); let hi = num(max);
    if (lo == null || hi == null || !(hi > lo)) {
      if (v === 0) { lo = 0; hi = 1; } else if (v > 0) { lo = 0; hi = r3(v * 3); } else { lo = r3(v * 3); hi = 0; }
    }
    return { min: Math.min(lo, v), max: Math.max(hi, v) };
  }
  // text → the checked explanation; code: the layer's code; sliders: its [{ key }]
  function parseExplain(text, { code = '', sliders = [] } = {}) {
    const s = String(text || '');
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    let j = null; try { j = a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null; } catch { j = null; }
    if (!j || typeof j.what !== 'string' || !j.what.trim()) throw new Error('The explanation didn\'t come back in a readable form. Try again.');
    const what = String(j.what).split(/\n+/).map((l) => cap(l, 220)).filter(Boolean).slice(0, 4).join('\n');
    const parts = (Array.isArray(j.parts) ? j.parts : []).filter((p) => p && p.does).slice(0, 8).map((p) => ({ lines: cap(p.lines, 16), does: cap(p.does, 140) }));
    const keys = new Set(sliders.map((x) => x.key));
    const slid = (Array.isArray(j.sliders) ? j.sliders : []).filter((x) => x && keys.has(x.key)).slice(0, 4).map((x) => ({ key: x.key, why: cap(x.why, 100) }));
    const lines = String(code).split('\n');
    const inTweak = tweakSpan(lines);
    const taken = new Set([...keys]);
    const hard = [];
    for (const h of Array.isArray(j.hardcoded) ? j.hardcoded : []) {
      if (hard.length >= 4) break;
      if (!h || h.text == null) continue;
      const text = String(h.text).trim();
      const val = valueOf(text);
      if (!val) continue;
      // the line it names, or the nearest one (±2) that really holds that value
      const at = Number(h.line) - 1;
      const near = [at, at - 1, at + 1, at - 2, at + 2].filter((k) => k >= 0 && k < lines.length && !inTweak.has(k));
      const k = near.find((i) => matcher(text).test(lines[i].replace(/\/\/.*$/, '')));
      if (k == null) continue;
      let key = String(h.key || h.label || 'value').replace(/[^\w$]+(\w)/g, (_, c) => c.toUpperCase()).replace(/[^\w$]/g, '');
      if (!IDENT.test(key)) key = `v${key}`;
      key = key.charAt(0).toLowerCase() + key.slice(1);
      if (!IDENT.test(key)) continue;
      let n = 2; const base = key; while (taken.has(key)) { key = `${base}${n}`; n += 1; }
      taken.add(key);
      const item = { line: k + 1, text, label: cap(h.label || key, 40), key, kind: val.kind, value: val.value, why: cap(h.why, 100) };
      if (val.kind === 'number') Object.assign(item, rangeFor(val.value, h.min, h.max));
      hard.push(item);
    }
    return { what, parts, sliders: slid, hardcoded: hard };
  }

  // ---------- "Turn into a slider": the code edit ----------
  // code + { line, text, key, kind, value, min, max, label } → { code, key, varName } (throws when it can't be placed)
  function sliderEdit(code, it) {
    const lines = String(code).split('\n');
    const at = Number(it.line) - 1;
    const re = matcher(it.text);
    const inTweak = tweakSpan(lines);
    // its line, or a line or two away (an earlier "Turn into a slider" may have added the tweak() line above it)
    const i = [at, at + 1, at - 1, at + 2, at - 2].find((k) => k >= 0 && k < lines.length && !inTweak.has(k) && re.test(lines[k].replace(/\/\/.*$/, '')));
    if (i == null) throw new Error(`"${it.text}" isn't on line ${it.line} any more. Explain it again.`);
    const decl = String(code).match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*tweak\s*\(\s*\{/);
    let varName = decl?.[1] || null;
    if (!varName) varName = ['P', 'K', 'TW', 'SL'].find((v) => !new RegExp(`\\b${v}\\b`).test(code)) || 'P_';
    lines[i] = lines[i].replace(re, `${varName}.${it.key}`); // (a colour becomes '#rrggbb': three.js takes it wherever 0x… went)
    const entry = `${it.key}: ${it.kind === 'color' ? `{ value: ${JSON.stringify(it.value)}, label: ${JSON.stringify(it.label)} }` : `{ value: ${r3(it.value)}, min: ${r3(it.min)}, max: ${r3(it.max)}, label: ${JSON.stringify(it.label)} }`}`;
    let out;
    if (decl) {
      out = lines.join('\n').replace(/(\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*tweak\s*\(\s*\{)/, `$1 ${entry},`);
    } else {
      // a new tweak() after the imports (multi-line imports included)
      let at = 0;
      for (let k = 0; k < lines.length; k += 1) {
        if (/^\s*import\b/.test(lines[k])) {
          let e = k;
          while (e < lines.length - 1 && !/\bfrom\s*['"]|^\s*import\s*['"]|;\s*$/.test(lines[e])) e += 1;
          at = e + 1; k = e;
        }
      }
      lines.splice(at, 0, `const ${varName} = tweak({ ${entry} }); // (✦ Turn into a slider)`);
      out = lines.join('\n');
    }
    return { code: out, key: it.key, varName };
  }

  // ---------- 2. the plain-words tweak ----------
  // x = { name, request, what, sliders, keyed: ['opacity', 'speed'…], song: { duration, bpm, sections: [{ start, end, label, energy }] } }
  function tweakPrompt(x) {
    const sl = (x.sliders || []).filter((s) => s.key != null).slice(0, 24);
    const song = x.song;
    const secs = (song?.sections || []).slice(0, 16).map((s) => `${r3(s.start)}–${r3(s.end)} s ${cap(s.label || '', 16)}${s.energy != null ? ` (${typeof s.energy === 'number' ? r3(s.energy) : s.energy})` : ''}`);
    return secret([
      `${THEAD} "${cap(x.name || 'layer', 48)}".`,
      `The owner says: make it ${cap(x.request, 300)}`,
      x.what ? `What it is: ${cap(x.what, 400)}` : '',
      `Its sliders: ${sl.length ? sl.map(sliderLine).join(', ') : 'none'}.`,
      `Properties every layer can keyframe: ${ANIM.join(', ')} (opacity 0–1, scale 0–4, rotate in degrees).${(x.keyed || []).length ? ` Keyed already: ${x.keyed.join(', ')}.` : ''}`,
      song ? `The song: ${song.duration ? `${r3(song.duration)} s` : ''}${song.bpm ? `, ${Math.round(song.bpm)} BPM` : ''}${secs.length ? `; sections: ${secs.join(' · ')}` : ''}.` : 'No song: times are the scene\'s own clock (s).',
      '',
      'If the wish can be done with these sliders (values in range) and keyframes on sliders or those properties, reply',
      '{"set":{"<slider key>":<value>},"keys":[{"property":"<slider key or property>","keys":[{"time":<s>,"value":<v>}]}],"say":"one plain line of what changed"}',
      'Otherwise (new shapes, code, colours not in a slider, other layers…) reply {"director":"<the request rewritten clearly for the scene\'s AI director, one or two sentences>"}.',
      'JSON only.',
    ].filter((l) => l !== '').join('\n'));
  }
  // text → { kind: 'plan', set, keys, say } | { kind: 'director', text }; sliders: the layer's [{ key, min, max, value }]
  function parsePlan(text, sliders = [], { duration = null, request = '' } = {}) {
    const s = String(text || '');
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    let j = null; try { j = a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null; } catch { j = null; }
    const toDirector = (t) => ({ kind: 'director', text: cap(t || `Make the layer ${request}`, 600) });
    if (!j) throw new Error('The tweak didn\'t come back in a readable form. Try again.');
    if (typeof j.director === 'string' && j.director.trim()) return toDirector(j.director);
    const byKey = (k) => sliders.find((x) => x.key === k) || sliders.find((x) => String(x.label || '').toLowerCase() === String(k || '').toLowerCase()) || null;
    const fit = (sl, v) => {
      if (typeof v === 'boolean' || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) return typeof sl.value === typeof v ? v : null;
      if (num(v) == null || typeof sl.value !== 'number') return null;
      return num(sl.min) != null && num(sl.max) != null ? r3(clamp(v, sl.min, sl.max)) : r3(v);
    };
    const set = {};
    for (const [k, v] of Object.entries(j.set && typeof j.set === 'object' ? j.set : {})) {
      const sl = byKey(k); if (!sl) continue;
      const x = fit(sl, v); if (x != null) set[sl.key] = x;
    }
    const tmax = num(duration) > 0 ? duration : 600;
    const keys = [];
    for (const g of (Array.isArray(j.keys) ? j.keys : []).slice(0, 6)) {
      if (!g || typeof g.property !== 'string' || !Array.isArray(g.keys)) continue;
      const p = g.property.trim();
      const sl = ANIM.includes(p) ? null : byKey(p);
      if (!sl && !ANIM.includes(p)) continue;
      const range = sl ? (num(sl.min) != null && num(sl.max) != null ? [sl.min, sl.max] : [-1e6, 1e6]) : p === 'opacity' ? [0, 1] : p === 'scale' ? [0, 4] : p === 'rotate' ? [-720, 720] : [-2, 2];
      if (sl && typeof sl.value !== 'number') continue;
      const list = g.keys.filter((k) => num(k?.time) != null && num(k.value) != null).slice(0, 24)
        .map((k) => ({ time: r3(clamp(k.time, 0, tmax)), value: r3(clamp(k.value, range[0], range[1])) }));
      if (list.length >= 2) keys.push({ property: sl ? sl.key : p, keys: list });
    }
    if (!Object.keys(set).length && !keys.length) return toDirector(j.say ? `${request} (${j.say})` : '');
    return { kind: 'plan', set, keys, say: cap(j.say || '', 160) };
  }
  // what a plan does, in words ("speed 1 → 0.5 · 4 keys on glow")
  function planWords(plan, sliders = []) {
    if (!plan || plan.kind !== 'plan') return '';
    const was = (k) => sliders.find((x) => x.key === k)?.value;
    return [...Object.entries(plan.set).map(([k, v]) => `${k} ${was(k) != null ? `${typeof was(k) === 'number' ? r3(was(k)) : was(k)} → ` : '→ '}${v}`),
      ...plan.keys.map((g) => `${g.keys.length} keys on ${g.property}`)].join(' · ');
  }
  const dot = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
  // the owner's message to the director for a wish the sliders can't do
  const directorMessage = (name, request, text) => `About the layer "${name}": make it ${dot(String(request).trim())}${text && text !== `Make the layer ${request}` ? ` (${dot(text)})` : ''} Keep the rest of the scene as it is.`;

  // ---------- the cache ----------
  const norm = (d) => ({ v: 1, list: Array.isArray(d?.list) ? d.list.filter((e) => e && typeof e.id === 'string' && typeof e.hash === 'string' && e.data) : [] });
  // the layer's own entry with this hash, else any layer's with the same code (a copy of it)
  function lookup(d, id, h) { const l = norm(d).list; return l.find((e) => e.id === id && e.hash === h) || l.find((e) => e.hash === h) || null; }
  function put(d, entry) {
    const l = norm(d).list.filter((e) => !(e.id === entry.id && e.hash === entry.hash));
    const mine = l.filter((e) => e.id === entry.id);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - 2))); // a layer keeps its last 3 codes (an undo finds its explanation again)
    return { v: 1, list: [...l.filter((e) => !drop.has(e)), entry].slice(-MAX) };
  }

  // ---------- the cost (shown before running) ----------
  // a lean helper run: its own small prompt and the words here; the answer is short JSON
  const estimate = ({ chars = 2000, out = 500 } = {}) => ({ input: Math.round(900 + chars / 3.6), output: out });
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude', model = '') => `About ${kfmt(c.input)} tokens in and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''} (the cheapest helper)`;

  const api = { STORE, MAX, HEAD, THEAD, PERSONA, ANIM, hash, numbered, explainPrompt, parseExplain, valueOf, sliderEdit, tweakPrompt, parsePlan, planWords, directorMessage, norm, lookup, put, estimate, costLine };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
if (typeof window !== 'undefined') window.ExplainCore = ExplainCore;
