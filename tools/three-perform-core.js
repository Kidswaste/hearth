// ◉ Perform (round 131, perform131): the pure part (no window, loads in Node too). docs/upgrades/perform131.md
// tools/three-perform.js is the live mode (keys, the strip, the output); this file decides which key does what, reads
// the director's prepared set, and turns a recorded performance into timeline cues.
//   keymap({ cues, looks, set })   → { cues: [{ key, name, time, looks }], looks: [{ key, name }], missing: [names] }
//        cues: the timeline's cues in time order [{ time, name, looks }]; looks: the layer's saved look names;
//        set: the scene's prepared set { cues: { '1': name }, looks: { q: name } } (none: cues 1–9 in time order,
//        looks Q W E R Y U I O P in the layer's order)
//   setup(raw, { cues, looks, layers }) → { set, problems }   the AI's `three_do perform { setup }`, checked
//   recorded(events)               → [{ time, name, looks? }]  the switches as cues (editCues' add list)
//   nextCue(cues, t)               → the first cue after t (null at the end)
//   text(set) / compact(map)       → "1 Intro · 2 Drop · Q Calm · W Hype · on the bar"
const PerformCore = (() => {
  const CUE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  // T stays Tap (the timeline's own tap key), so the looks skip it
  const LOOK_KEYS = ['q', 'w', 'e', 'r', 'y', 'u', 'i', 'o', 'p'];
  const QUANTS = [['now', 'Now'], ['beat', 'Beat'], ['bar', 'Bar']];
  const low = (s) => String(s ?? '').trim().toLowerCase();
  const clip = (s, n = 40) => String(s ?? '').trim().slice(0, n);
  const nextQuant = (q) => QUANTS[(QUANTS.findIndex(([k]) => k === q) + 1) % QUANTS.length][0];
  const quantWord = (q) => (q === 'now' ? 'now' : q === 'beat' ? 'on the beat' : 'on the bar');

  // a list or a { key: name } object → { key: name } over the given keys
  function toKeys(v, keys) {
    const out = {};
    if (Array.isArray(v)) v.slice(0, keys.length).forEach((name, i) => { if (name != null && String(name).trim()) out[keys[i]] = clip(name); });
    else if (v && typeof v === 'object') for (const [k, name] of Object.entries(v)) { const kk = low(k); if (keys.includes(kk) && name != null && String(name).trim()) out[kk] = clip(name); }
    return out;
  }

  function keymap({ cues = [], looks = [], set = null } = {}) {
    const sorted = [...cues].filter((c) => c && c.name != null).sort((a, b) => (a.time ?? a.t) - (b.time ?? b.t));
    const missing = [];
    const findCue = (name) => sorted.find((c) => low(c.name) === low(name));
    const findLook = (name) => looks.find((n) => low(n) === low(name));
    let cueRows; let lookRows;
    if (set?.cues && Object.keys(set.cues).length) {
      cueRows = CUE_KEYS.filter((k) => set.cues[k]).map((k) => { const c = findCue(set.cues[k]); if (!c) missing.push(set.cues[k]); return c ? { key: k, name: c.name, time: c.time ?? c.t, looks: c.looks || [] } : null; }).filter(Boolean);
    } else cueRows = sorted.slice(0, CUE_KEYS.length).map((c, i) => ({ key: CUE_KEYS[i], name: c.name, time: c.time ?? c.t, looks: c.looks || [] }));
    if (set?.looks && Object.keys(set.looks).length) {
      lookRows = LOOK_KEYS.filter((k) => set.looks[k]).map((k) => { const n = findLook(set.looks[k]); if (!n) missing.push(set.looks[k]); return n ? { key: k, name: n } : null; }).filter(Boolean);
    } else lookRows = looks.slice(0, LOOK_KEYS.length).map((n, i) => ({ key: LOOK_KEYS[i], name: n }));
    return { cues: cueRows, looks: lookRows, missing };
  }

  // the director's set: names checked against the scene's cues and the layer's looks (case-insensitive), the rest named
  function setup(raw, { cues = [], looks = [], layers = [] } = {}) {
    const problems = [];
    if (!raw || typeof raw !== 'object') return { set: null, problems: ['setup needs { cues: [names] or { "1": name }, looks: [names] or { q: name } }'] };
    const cueKeys = toKeys(raw.cues, CUE_KEYS); const lookKeys = toKeys(raw.looks, LOOK_KEYS);
    const cueNames = cues.map((c) => c.name); const set = { cues: {}, looks: {}, by: 'ai', at: Date.now() };
    for (const [k, n] of Object.entries(cueKeys)) { const hit = cueNames.find((x) => low(x) === low(n)); if (hit) set.cues[k] = hit; else problems.push(`no cue "${n}"`); }
    for (const [k, n] of Object.entries(lookKeys)) { const hit = looks.find((x) => low(x) === low(n)); if (hit) set.looks[k] = hit; else problems.push(`no look "${n}"`); }
    if (raw.layer != null) { const L = layers.find((x) => low(x.name) === low(raw.layer) || x.id === raw.layer); if (L) set.layer = L.id; else problems.push(`no layer "${raw.layer}"`); }
    if (raw.quant != null) { const q = low(raw.quant); if (QUANTS.some(([k]) => k === q)) set.quant = q; else problems.push('quant: now | beat | bar'); }
    if (raw.note) set.note = clip(raw.note, 120);
    if (!Object.keys(set.cues).length && !Object.keys(set.looks).length) return { set: null, problems: problems.length ? problems : ['nothing to map'] };
    return { set, problems };
  }

  // the switches, as cues on the timeline: a cue jump keeps its cue's name and looks, a look switch is "◐ <look>"
  // carrying that look; two switches within 20 ms: the later one wins (editCues treats them as one spot)
  function recorded(events = []) {
    const out = [];
    for (const e of [...events].sort((a, b) => a.t - b.t)) {
      if (!(e.t >= 0)) continue;
      const time = Math.round(e.t * 10000) / 10000;
      const cue = e.kind === 'look'
        ? { time, name: clip(`◐ ${e.name}`), looks: [{ layer: String(e.layer), name: String(e.name) }] }
        : { time, name: clip(e.name), ...(e.looks?.length ? { looks: e.looks.map((l) => ({ layer: String(l.layer), name: String(l.name) })) } : {}) };
      const same = out.findIndex((x) => Math.abs(x.time - time) < 0.02);
      if (same >= 0) out[same] = cue; else out.push(cue);
    }
    return out;
  }

  const nextCue = (cues = [], t = 0) => [...cues].sort((a, b) => (a.time ?? a.t) - (b.time ?? b.t)).find((c) => (c.time ?? c.t) > t + 0.05) || null;

  function compact(map, quant) {
    const parts = [...(map.cues || []).map((c) => `${c.key} ${c.name}`), ...(map.looks || []).map((l) => `${l.key.toUpperCase()} ${l.name}`)];
    return `${parts.join(' · ') || 'no cues or looks yet'}${quant ? ` · ${quantWord(quant)}` : ''}`;
  }
  function text(set) {
    if (!set) return 'none';
    const parts = [...CUE_KEYS.filter((k) => set.cues?.[k]).map((k) => `${k} ${set.cues[k]}`), ...LOOK_KEYS.filter((k) => set.looks?.[k]).map((k) => `${k.toUpperCase()} ${set.looks[k]}`)];
    return `${parts.join(' · ')}${set.quant ? ` · ${quantWord(set.quant)}` : ''}`;
  }

  return { CUE_KEYS, LOOK_KEYS, QUANTS, nextQuant, quantWord, keymap, setup, recorded, nextCue, compact, text };
})();
if (typeof module !== 'undefined') module.exports = PerformCore;
else window.PerformCore = PerformCore;
