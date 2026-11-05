// ✦ 3 takes, the pure part (round 130, takes130): loads in Node. tools/three-takes.js is the card.
// - TAKES: the three ways one ask is done, so the takes really differ (A goes all the way, B through colour and light,
//   C through motion and timing): the crew's angles (tools/three-crew.js), one helper each.
// - extra(): the lines the takes add to the crew's shared brief: the ask, and the project's brief and palette when the
//   scene belongs to a project that has them.
// - costLine(): the estimate in round 129's words (projectbrief-core draftLine): tokens in / out · who · model.
// - labelOf(): a take's one-line label (what differs), from what its helper said it changed.
// - mixPlan(): "A's colours with B's motion": only when two takes changed nothing but slider values (tweak() defaults)
//   and one changed the colours, the other the motion. Then the mix is the scene's code with those values.
const TakesCore = (() => {
  const LETTERS = ['A', 'B', 'C'];
  const TAKES = [
    { key: 'bold', name: 'All the way', angle: 'all the way: the strongest, most obvious version of the ask (push it further than feels safe)' },
    { key: 'colour', name: 'Colour & light', angle: 'colour & light: do the ask mainly through colours, light, glow and materials; keep the motion as it is' },
    { key: 'motion', name: 'Motion & rhythm', angle: 'motion & rhythm: do the ask mainly through movement and timing with the music; keep the colours as they are' },
  ];
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const HEX = /^#[0-9a-f]{6}$/i;
  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n || 0)));

  // "/takes make the glow more aggressive" → the ask
  const askOf = (text) => cap(String(text || '').replace(/^\s*\/takes\b/i, ''), 400);

  // the lines added to the crew's shared brief (byte-stable for one ask: the same for the 3 helpers)
  function extra({ brief = '', palette = [] } = {}) {
    const pal = (palette || []).filter((c) => HEX.test(String(c))).slice(0, 8);
    return [
      'Three takes of this ONE change, shown side by side so the owner can pick one: do the whole ask, in your take\'s way (below). Keep everything the ask doesn\'t touch.',
      'Where a value does the job, change the tweak() default rather than rewriting code.',
      pal.length ? `The project's palette (stay in it): ${pal.join(' ')}` : '',
      brief ? `The project's brief: ${cap(brief, 600)}` : '',
    ].filter(Boolean).join('\n');
  }

  // round 129's line: "About 32k tokens in (most re-read from the cache) and 3k out · Claude · model"
  function costLine(est, { n = 3, out = 900, who = 'Claude', model = '' } = {}) {
    const output = Math.round(n * out);
    const input = Math.max(0, Math.round((est?.total || 0) - output));
    return `About ${kfmt(input)} tokens in (most re-read from the cache) and ${kfmt(output)} out · ${who}${model ? ` · ${model}` : ''}`;
  }

  // what a take did, in one line (its helper's own last line, without "#2:" and tool notes)
  function labelOf(text, i) {
    const t = cap(String(text || '').replace(/^\s*#\d+\s*[:·.-]\s*/, '').replace(/\n[\s\S]*$/, ''), 90);
    return t || TAKES[i]?.name || `Take ${LETTERS[i] || i + 1}`;
  }

  // ---------- Mix ----------
  const RX = {
    colour: /colou?r|hue|tint|palette|bg\b|background|sat(uration)?\b|bright|warm|cool/i,
    motion: /speed|spin|rotat|flow|drift|wobble|wave|sway|bounce|pulse|tempo|rate|turbul|swirl|jitter|shake|freq|velocity|orbit|time.?scale|anim|motion|wander|twist|punch|kick/i,
  };
  const groupOf = (it) => (typeof it.orig === 'string' && HEX.test(it.orig) ? 'colour' : RX.colour.test(`${it.key} ${it.label || ''}`) ? 'colour' : RX.motion.test(`${it.key} ${it.label || ''}`) ? 'motion' : 'other');
  // a layer's code with its slider values cut out, and the values by key
  function shape(code, scan) {
    let items = [];
    try { items = (scan(code).items || []).filter((it) => it.key != null && Number.isFinite(it.start) && Number.isFinite(it.end)).sort((a, b) => a.start - b.start); } catch { items = []; }
    let sk = ''; let at = 0;
    for (const it of items) { sk += `${code.slice(at, it.start)}\u0000`; at = it.end; }
    sk += code.slice(at);
    return { sk, items, vals: Object.fromEntries(items.map((it) => [it.key, it.orig])) };
  }
  // a take as slider values over the scene (null when it changed code, layers or their order)
  function valuesOf(base, take, scan) {
    if (!take || take.length !== base.length) return null;
    const out = [];
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i]; const t = take[i];
      if (!t || t.id !== b.id) return null;
      const sb = shape(b.code, scan); const st = shape(t.code, scan);
      if (sb.sk !== st.sk) return null;
      const changed = {};
      for (const it of sb.items) if (JSON.stringify(st.vals[it.key]) !== JSON.stringify(it.orig)) changed[it.key] = { value: st.vals[it.key], group: groupOf(it) };
      out.push({ id: b.id, changed });
    }
    return out;
  }
  const groupsOf = (v) => new Set(v.flatMap((L) => Object.values(L.changed).map((c) => c.group)));
  // base: the scene's layers ({ id, code }); takes: each take's layers. → [{ a, b, label }] the mixes worth offering
  function mixPlan(base, takes, { scan }) {
    const vals = takes.map((t) => valuesOf(base, t, scan));
    const out = [];
    vals.forEach((va, a) => {
      if (!va || !groupsOf(va).has('colour')) return;
      vals.forEach((vb, b) => {
        if (a === b || !vb || !groupsOf(vb).has('motion')) return;
        out.push({ a, b, label: `Take ${LETTERS[a]}'s colours with take ${LETTERS[b]}'s motion` });
      });
    });
    return out;
  }
  // the mix's layers: the scene's code, with take a's values and take b's motion values over them
  function mixLayers(base, takes, a, b, { scan, applyValues }) {
    const va = valuesOf(base, takes[a], scan); const vb = valuesOf(base, takes[b], scan);
    if (!va || !vb) return null;
    return base.map((L, i) => {
      const { items } = scan(L.code);
      const want = { ...Object.fromEntries(Object.entries(va[i].changed).map(([k, c]) => [k, c.value])), ...Object.fromEntries(Object.entries(vb[i].changed).filter(([, c]) => c.group === 'motion').map(([k, c]) => [k, c.value])) };
      if (!Object.keys(want).length) return { ...L };
      return { ...L, code: applyValues(L.code, items, items.map((it) => (it.key in want ? want[it.key] : it.orig))) };
    });
  }

  const api = { LETTERS, TAKES, askOf, extra, costLine, labelOf, groupOf, valuesOf, mixPlan, mixLayers };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
if (typeof window !== 'undefined') window.TakesCore = TakesCore;
