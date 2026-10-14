// ◧ Before / after (round 37, abcompare): the logic of comparing the Lab scene with how it was before the last change
// that altered its look, without the DOM (Node-tested: dev/abcompare-test.js). tools/three-abcompare.js is the Lab side.
//   A "snap" is { sketch, st: ThreeLab.tm.state() (layers with their code, vals, sel, palette), full: { layer: { key:
//   value } } (every slider, not only the changed ones), at, still }.
//   Changes come in as notes (kind + optional label / who); the notes of one change (a slider drag session, a director
//   turn, a variation) settle into one pair { before, kind, label, at, mode }: mode 'live' when only slider values /
//   the palette differ (the preview can show "before" itself, animated), 'still' when code, layers or their props do
//   (a picture of the scene as it was).
const ABCore = (() => {
  // what a change is called on the chip ("Before: Director edit · 2 min ago"); rank: the most telling one wins when
  // several notes make up one change (a variation also moves sliders and runs the time machine)
  const KINDS = {
    keep: { label: 'Before you kept the earlier one', rank: 9, ms: 600 },
    variations: { label: '🎲 Variation', rank: 8, ms: 700 },
    doctor: { label: '🩺 Fix my scene', rank: 8, ms: 900 },
    autopolish: { label: '✨ Look finished', rank: 8, ms: 900 },
    lookmatch: { label: '🎨 Look match', rank: 8, ms: 900 },
    director: { label: 'Director edit', rank: 7, ms: 900 },
    look: { label: 'Look', rank: 6, ms: 700 },
    restore: { label: 'Restored version', rank: 6, ms: 900 },
    pick: { label: 'Picked from a version', rank: 6, ms: 900 },
    shuffle: { label: 'Shuffle', rank: 5, ms: 900 },
    undo: { label: 'Undo', rank: 4, ms: 800 },
    sliders: { label: 'Slider change', rank: 3, ms: 1500 }, // a drag session: several drags in a row are one change
    run: { label: 'Code run', rank: 2, ms: 900 },
    layers: { label: 'Layer change', rank: 2, ms: 900 },
  };
  const WHO = { claude: 'Claude', codex: 'Astra', crew: 'The crew' };
  const kindOf = (k) => KINDS[k] || { label: 'Change', rank: 1, ms: 900 };
  const delayOf = (k) => kindOf(k).ms;

  // a note joins the pending change: the higher-ranked kind (and its label) wins; an explicit label beats a generic one
  function merge(pend, kind, extra = {}) {
    const p = pend ? { ...pend } : { kind: null, label: null, by: null, chat: null, n: 0 };
    p.n += 1;
    const r = kindOf(kind).rank; const pr = p.kind ? kindOf(p.kind).rank : 0;
    if (r > pr || (r === pr && extra.label && !p.label)) { p.kind = kind; p.label = extra.label || null; }
    if (extra.by && (kind === 'director' || !p.by)) p.by = extra.by;
    if (extra.chat) p.chat = extra.chat;
    return p;
  }
  function labelOf(p) {
    if (!p) return 'Change';
    if (p.label) return p.label;
    if (p.kind === 'director' && WHO[p.by]) return `${WHO[p.by]}'s edit`;
    return kindOf(p.kind).label;
  }

  // ---------- comparing two snaps ----------
  // the layers without what only the sliders' values / the selection change (those are compared on their own)
  // (a layer's name and its label color in the list don't change the picture)
  const layersSig = (snap) => JSON.stringify((snap?.st?.layers || []).map((L) => {
    const { vals: _v, name: _n, color: _c, ...rest } = L; return rest;
  }));
  const palSig = (snap) => JSON.stringify(snap?.st?.palette || snap?.palette || []);
  // every slider value that differs: { layer: { key: before value } } (keys only one side has are left out: a layer
  // that came or went is a layers change)
  function valueDiff(before, now) {
    const out = {};
    for (const [layer, vals] of Object.entries(before?.full || {})) {
      const n = now?.full?.[layer];
      if (!n) continue;
      for (const [k, v] of Object.entries(vals)) if (k in n && n[k] !== v) (out[layer] ||= {})[k] = v;
    }
    return out;
  }
  const count = (d) => Object.values(d).reduce((s, x) => s + Object.keys(x).length, 0);
  function compare(before, now) {
    if (!before || !now || before.sketch !== now.sketch) return { same: true, mode: null };
    const layers = layersSig(before) !== layersSig(now);
    const palette = palSig(before) !== palSig(now);
    const vd = valueDiff(before, now);
    const vals = count(vd);
    return { same: !layers && !palette && !vals, mode: layers ? 'still' : 'live', layers, palette, vals, diff: vd };
  }
  // the values to set to show `to` while `from` is on (only the ones that differ), and the way back
  function swapValues(from, to) { return { go: valueDiff(to, from), back: valueDiff(from, to) }; }

  // ---------- words and small maths ----------
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s} s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  }
  const chipText = (pair, now = Date.now()) => (pair ? `Before: ${pair.label} · ${ago(now - pair.at)}` : '');
  // B pressed and let go quickly is a tap (the split view); held longer, "before" showed while it was down
  const TAP_MS = 260;
  const isTap = (downAt, upAt) => upAt - downAt < TAP_MS;
  const clampSplit = (x) => (Number.isFinite(x) ? Math.max(0.02, Math.min(0.98, x)) : 0.5);
  // the clip of the "before" picture: left of the line (or right of it, swapped)
  const clipFor = (x, swapped) => (swapped ? `inset(0 0 0 ${Math.round(clampSplit(x) * 1000) / 10}%)` : `inset(0 ${Math.round((1 - clampSplit(x)) * 1000) / 10}% 0 0)`);
  // the picture's long side in px for the split view: the frame's own pixels, at most 1280
  const shotSize = (w, h, dpr = 1) => Math.max(160, Math.min(1280, Math.round(Math.max(w || 0, h || 0) * (dpr || 1))));

  return { KINDS, kindOf, delayOf, merge, labelOf, valueDiff, compare, swapValues, ago, chipText, TAP_MS, isTap, clampSplit, clipFor, shotSize };
})();
if (typeof module !== 'undefined') module.exports = ABCore;
