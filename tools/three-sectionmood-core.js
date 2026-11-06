// 🎭 Give each section its mood (round 138, sectionmood138), the pure part: loads in the Lab (lazy group "sectionmood")
// and in Node. docs/upgrades/sectionmood138.md. Built on what the Lab has, nothing duplicated:
//   · the song's sections on their downbeats, named like ✦ Map to the song ("Drop 2"): SongMapCore.sectionsOf
//   · the 🎛 mood dials (DialsCore): a section's mood is a key on each dial (Energy, Darkness, Chaos, Warmth…), baked
//     onto the sliders like any keyed dial, so renders, the sequence and ◉ Perform play it
//   · saved looks ride on the section's cue (as ✦ Map does), so playback and ◉ Perform's 1–9 play them
//   · the brief's tempo plan (ProjectBrief.get(id).tempo: [{ section, plan }]) decides a section's mood when it names it
//   moodFromText(text) → 'calm' | 'rising' | 'punchy' | 'dark' | 'fading' | 'bright' | 'dreamy' | null
//   moods(input, over) → [{ i, label, name, start, end, energy, mood, from: 'brief' | 'default' | 'you' | 'ai', plan }]
//   plan(input, { over, ai }) → { by, bar, sections, items, needDials, dials: [names] }
//     input: { duration, grid, sections: analysis.sections, cues: [{ time, name, looks }], tempo, dials: DialsCore data,
//              layers: [{ id, name, filter, looks: ['Calm', …] }] }
//     items: { id, kind: 'dial', section, dial, dialName, keys: [{ t, v, ease }], from, to }
//          | { id, kind: 'look', section, time, cueName, layer, layerName, name }
//   mergeKeys(keys, add, a, b) · text(item) · summary(plan) · askPrompt(plan, input) · parseAI(text, plan) · estimate(prompt)
const SectionMoodCore = (() => {
  const SM = () => (typeof SongMapCore !== 'undefined' ? SongMapCore : require('./three-songmap-core.js'));
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  const r2 = (x) => Math.round(Number(x) * 100) / 100;
  const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  // ---------- moods: where each kind of dial sits (one value: held; two: from → to over the section) ----------
  const MOODS = {
    calm: { icon: '🌙', energy: [0.2], darkness: [0.45], chaos: [0.1], warmth: [0.45] },
    rising: { icon: '↗', energy: [0.3, 0.85], darkness: [0.45, 0.3], chaos: [0.2, 0.6], warmth: [0.5, 0.6] },
    punchy: { icon: '⚡', energy: [1], darkness: [0.15], chaos: [0.75], warmth: [0.7] },
    dark: { icon: '🌑', energy: [0.4], darkness: [0.9], chaos: [0.3], warmth: [0.25] },
    fading: { icon: '↘', energy: [0.4, 0.05], darkness: [0.55, 0.9], chaos: [0.2, 0], warmth: [0.45, 0.35] },
    bright: { icon: '☀', energy: [0.75], darkness: [0.05], chaos: [0.4], warmth: [0.65] },
    dreamy: { icon: '☁', energy: [0.3], darkness: [0.3], chaos: [0.15], warmth: [0.6] },
  };
  const NAMES = Object.keys(MOODS);
  const DEFAULT = { Intro: 'calm', Build: 'rising', Drop: 'punchy', Break: 'calm', Outro: 'fading' };
  const MOOD_WORDS = {
    calm: /\b(calm|soft|gentle|quiet|chill|slow|mellow|still|sparse|minimal|ambient|relax|peace|hush)/,
    rising: /\b(rising|rises|rise|build|grow|swell|tension|ramp|climb|lift|increas|crescendo)/,
    punchy: /\b(punch|hit|explo|big|hype|energ|intens|loud|bang|slam|full|peak|burst|max|wild|strobe|flash|aggress|heavy)/,
    dark: /\b(dark|moody|shadow|grim|night|ominous|black|gloom|sinister|eerie|noir)/,
    fading: /\b(fad|winds? down|dissolv|disappear|settl|trail|dies? out|resolv|dwindl)/,
    bright: /\b(bright|uplift|euphor|happy|shin|sunny|light up|vivid|joy)/,
    dreamy: /\b(dream|float|haz|ethereal|drift|misty)/,
  };
  // the earliest mood word in a text wins ("dark, then punchy" is dark)
  function moodFromText(text) {
    const s = ` ${words(text)}`;
    let best = null; let at = Infinity;
    for (const [m, re] of Object.entries(MOOD_WORDS)) { const i = s.search(re); if (i >= 0 && i < at) { at = i; best = m; } }
    return best;
  }
  // a tempo plan's section words → the analysis label (chorus is a drop, a verse is a break…)
  const SYN = { chorus: 'Drop', hook: 'Drop', drop: 'Drop', drops: 'Drop', peak: 'Drop', climax: 'Drop', build: 'Build', buildup: 'Build', 'build up': 'Build', builds: 'Build', 'pre chorus': 'Build', prechorus: 'Build', riser: 'Build', rise: 'Build', verse: 'Break', break: 'Break', breakdown: 'Break', bridge: 'Break', interlude: 'Break', intro: 'Intro', opening: 'Intro', start: 'Intro', outro: 'Outro', ending: 'Outro', end: 'Outro' };
  const canon = (s) => { const w = words(s).replace(/\b\d+\b/g, '').replace(/\b(the|all|every|each|section|part)\b/g, '').replace(/\s+/g, ' ').trim(); return SYN[w] || SYN[w.split(' ')[0]] || null; };
  function tempoFor(sec, tempo) {
    const list = (Array.isArray(tempo) ? tempo : []).filter((x) => x && (x.section || x.plan));
    return list.find((x) => words(x.section) === words(sec.name))
      || list.find((x) => words(x.section) === words(sec.label))
      || list.find((x) => canon(x.section) === sec.label)
      || null;
  }
  function moods(input = {}, over = {}) {
    const S = SM().sectionsOf(input);
    return S.list.map((s) => {
      const t = tempoFor(s, input.tempo);
      const fromBrief = t ? moodFromText(t.plan) || moodFromText(t.section) : null;
      const o = over[s.i];
      const mood = (o && MOODS[o.mood] ? o.mood : null) || fromBrief || DEFAULT[s.label] || (s.energy === 'loud' ? 'punchy' : 'calm');
      return { i: s.i, label: s.label, name: s.name, start: s.start, end: s.end, energy: s.energy, mood, from: o?.mood ? (o.by || 'you') : fromBrief ? 'brief' : 'default', plan: t ? String(t.plan || '').slice(0, 120) : '' };
    });
  }

  // ---------- which kind of dial a dial's name is ----------
  const KINDS = [
    ['energy', /energ|intens|power|hype|drive|punch|heat up|pump/, false],
    ['darkness', /dark|night|shadow|moody|dim|black|gloom/, false],
    ['chaos', /chaos|glitch|noise|wild|distort|jitter|mess|crazy/, false],
    ['warmth', /warm|heat|sun|fire|cozy|temper/, false],
    ['darkness', /bright|light|day/, true], // a "Brightness" dial: the other way round
    ['energy', /calm|chill|soft|still/, true],
  ];
  function kindOf(name) {
    const w = words(name);
    for (const [k, re, inv] of KINDS) if (re.test(w)) return { kind: k, invert: inv };
    return null;
  }
  // a dial's keys for one section
  function dialKeys(sec, kind, invert, vals, bar) {
    const v = (x) => r2(invert ? 1 - x : x);
    const start = r3(sec.start);
    if (vals.length < 2) return [{ t: start, v: v(vals[0]), ease: 'hold' }];
    const end = r3(Math.max(sec.start + Math.min(bar, (sec.end - sec.start) / 2), sec.end - 0.05));
    return [{ t: start, v: v(vals[0]), ease: 'ease' }, { t: end, v: v(vals[1]), ease: 'hold' }];
  }

  // ---------- saved looks that fit a mood ----------
  const LOOKS = {
    calm: /calm|soft|quiet|chill|mellow|ambient|still|gentle|intro/,
    rising: /build|rise|rising|tension|lift|grow/,
    punchy: /drop|hype|loud|full|peak|energy|intense|wild|big|chorus|punch/,
    dark: /dark|night|shadow|moody|noir|black/,
    fading: /fade|outro|soft|calm|quiet|dim|end/,
    bright: /bright|light|sun|day|hype|vivid/,
    dreamy: /dream|haze|soft|float|calm/,
  };
  function lookFor(looks, sec) {
    const L = (looks || []).map(String);
    return L.find((n) => words(n) === words(sec.label) || words(n) === words(sec.name))
      || L.find((n) => LOOKS[sec.mood]?.test(words(n)))
      || null;
  }

  // ---------- the plan ----------
  function plan(input = {}, { over = {}, by = 'local' } = {}) {
    const secs = moods(input, over);
    const bar = SM().sectionsOf(input).bar || 2;
    const dialsAll = (input.dials?.list || []).map((d) => ({ ...d, k: kindOf(d.name) }));
    const dials = dialsAll.filter((d) => d.k);
    const items = [];
    for (const s of secs) {
      const o = over[s.i] || {};
      for (const d of dials) {
        const own = o.dials && o.dials[words(d.name)];
        const vals = Array.isArray(own) ? own.map(clamp01) : own != null ? [clamp01(own)] : MOODS[s.mood][d.k.kind];
        const keys = dialKeys(s, d.k.kind, Array.isArray(own) || own != null ? false : d.k.invert, vals, bar);
        items.push({ id: `d${s.i}_${d.id}`, kind: 'dial', section: s.i, dial: d.id, dialName: d.name, keys, from: keys[0].v, to: keys[keys.length - 1].v });
      }
      for (const L of (input.layers || []).filter((x) => !x.filter && x.looks?.length)) {
        const want = o.looks?.find((x) => x.layer === L.id || words(x.layer) === words(L.name));
        const name = want ? L.looks.find((n) => words(n) === words(want.name)) : lookFor(L.looks, s);
        if (!name) continue;
        const cue = (input.cues || []).find((c) => Math.abs(Number(c.time) - s.start) < 0.05);
        if (cue?.looks?.some((l) => l.layer === L.id && l.name === name)) continue; // already there
        items.push({ id: `l${s.i}_${L.id}`, kind: 'look', section: s.i, time: s.start, cueName: cue?.name || s.name, layer: L.id, layerName: L.name, name });
      }
    }
    return { by, bar, sections: secs, items, needDials: !dials.length, dials: dials.map((d) => d.name), otherDials: dialsAll.filter((d) => !d.k).map((d) => d.name) };
  }
  // a dial's keys with a section's keys in: its old keys inside [a, b) go
  function mergeKeys(keys, add, a, b) {
    const keep = (keys || []).filter((k) => k.t < a - 0.005 || k.t >= b - 0.005).map((k) => ({ ...k }));
    return keep.concat(add.map((k) => ({ ...k }))).sort((x, y) => x.t - y.t);
  }

  // ---------- words ----------
  const pct = (v) => `${Math.round(v * 100)}%`;
  const text = (it) => (it.kind === 'dial' ? `🎛 ${it.dialName} ${it.keys.length > 1 ? `${pct(it.from)} → ${pct(it.to)}` : pct(it.from)}` : `◐ ${it.name} on ${it.layerName}`);
  const summary = (p) => `${p.sections.length} section${p.sections.length === 1 ? '' : 's'} · ${p.sections.map((s) => `${s.name} ${s.mood}`).join(', ')}`;

  // ---------- ✦ Ask the AI to refine (one small helper pass, the cost first) ----------
  const PERSONA = 'You are a careful music-visuals assistant. Answer with JSON only.';
  function askPrompt(p, input = {}) {
    const looks = (input.layers || []).filter((L) => L.looks?.length).map((L) => `${L.name}: ${L.looks.join(', ')}`);
    return ['🎭 Refine the mood of each section of a song for a music visual.',
      `Moods: ${NAMES.join(', ')}. Dials (0 = low, 1 = high): ${p.dials.join(', ') || 'none'}.`,
      looks.length ? `Saved looks per layer: ${looks.join(' · ')}.` : '',
      'The sections now (name start–end: mood · the brief\'s plan):',
      ...p.sections.map((s) => `${s.name} ${s.start}–${s.end}s: ${s.mood}${s.plan ? ` · "${s.plan}"` : ''}`),
      'Answer with JSON only: {"sections":[{"name":"Drop","mood":"punchy","dials":{"Energy":0.9},"look":{"layer":"<layer>","name":"<look>"}}]}. A dial value can be [from, to] to move over the section. Only sections you change.'].filter(Boolean).join('\n');
  }
  function parseAI(txt, p) {
    let j = null;
    const s = String(txt || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    try { j = JSON.parse(s.slice(a, b + 1)); } catch { j = null; }
    const over = {};
    for (const x of Array.isArray(j?.sections) ? j.sections : []) {
      const sec = p.sections.find((y) => words(y.name) === words(x?.name)) || p.sections.find((y) => words(y.label) === words(x?.name));
      if (!sec) continue;
      const o = { by: 'ai' };
      if (MOODS[x.mood]) o.mood = x.mood;
      if (x.dials && typeof x.dials === 'object') { o.dials = {}; for (const [k, v] of Object.entries(x.dials)) if (Number.isFinite(Number(v)) || (Array.isArray(v) && v.length === 2 && v.every((q) => Number.isFinite(Number(q))))) o.dials[words(k)] = Array.isArray(v) ? v.map(Number) : Number(v); }
      if (x.look?.name) o.looks = [{ layer: String(x.look.layer || ''), name: String(x.look.name) }];
      over[sec.i] = o;
    }
    return over;
  }
  const estimate = (prompt, out = 350) => ({ input: Math.round(900 + String(prompt || '').length / 3.6), output: out });

  const api = { MOODS, NAMES, DEFAULT, moodFromText, canon, tempoFor, moods, kindOf, dialKeys, lookFor, plan, mergeKeys, text, summary, askPrompt, parseAI, estimate, PERSONA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
if (typeof window !== 'undefined') window.SectionMoodCore = SectionMoodCore;
