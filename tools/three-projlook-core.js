// The project's look on a Lab scene (round 129, looks129): the pure part (no window, loads in Node too).
// tools/three-projlook.js draws the "Project look" strip in the Lab's toolbar and applies it; this file decides the
// colors. Nothing here rewrites code: the plan is slider values (tweak() colors) and ◉ material looks' tints.
//   sources(p, brief)                  → [{ id: 'project' | 'brief', name, colors }] the palettes a project has
//   plan(layers, palette, opts)        → { layers: [{ id, name, set, force, look }], changed, kept }
//        layers: [{ id, name, colors: [{ key, value, locked }], look: { part: { k, c, s } } | null }]
//        opts: { strength: 'full' | 'subtle', keepLocked: true, base(spec) → the look's own color }
//   merge(lists, n)                    → one palette from several (the moodboard's pictures and swatches)
//   mix(a, b, t) · lum(hex) · sat(hex) · norm(hex)
const ProjLookCore = (() => {
  const HEX = /^#[0-9a-f]{6}$/i;
  const SUBTLE = 0.45; // how far "subtle" moves a color toward the palette
  const norm = (h) => {
    const s = String(h || '').trim().toLowerCase();
    if (/^#?[0-9a-f]{3}$/.test(s)) { const x = s.replace('#', ''); return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`; }
    if (/^#?[0-9a-f]{6}$/.test(s)) return s.startsWith('#') ? s : `#${s}`;
    return null;
  };
  const rgb = (h) => { const n = parseInt(norm(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const lum = (h) => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const sat = (h) => { const c = rgb(h); return (Math.max(...c) - Math.min(...c)) / 255; };
  const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const dist = (a, b) => { const x = rgb(a); const y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).map(norm).filter(Boolean))].slice(0, 16);

  // the palettes a project has: its own (picked at creation or taken from the moodboard), then its brief's
  function sources(p, brief) {
    const out = [];
    const own = clean(p?.workspace?.palette);
    if (own.length) out.push({ id: 'project', name: 'The project\'s palette', colors: own });
    const br = clean(brief?.palette);
    if (br.length && br.join() !== own.join()) out.push({ id: 'brief', name: 'The brief\'s palette', colors: br });
    return out;
  }

  // Which palette color each color slider gets. In a layer, the sliders keep their order from dark to light (a dark
  // background stays the darkest, a highlight the lightest); a layer with one color gets a vivid one, a different one
  // per layer. ◉ material looks get vivid ones too.
  function plan(layers, palette, opts = {}) {
    const pal = clean(palette);
    const out = { layers: [], changed: 0, kept: 0 };
    if (!pal.length) return out;
    const strength = opts.strength === 'subtle' ? SUBTLE : 1;
    const keepLocked = opts.keepLocked !== false;
    const byLum = pal.slice().sort((a, b) => lum(a) - lum(b));
    const bySat = pal.slice().sort((a, b) => sat(b) - sat(a) || lum(b) - lum(a));
    const toward = (from, to) => (strength >= 1 || !norm(from) ? to : mix(norm(from), to, strength));
    (layers || []).forEach((L, li) => {
      const set = {}; const force = [];
      const cs = (L.colors || []).filter((c) => c && c.key != null && norm(c.value));
      const use = cs.filter((c) => !(c.locked && keepLocked));
      out.kept += cs.length - use.length;
      const ranked = use.slice().sort((a, b) => lum(a.value) - lum(b.value));
      ranked.forEach((c, r) => {
        const target = ranked.length === 1 ? bySat[li % bySat.length] : byLum[Math.round((r * (byLum.length - 1)) / (ranked.length - 1))];
        const v = toward(c.value, target);
        if (v !== norm(c.value)) { set[c.key] = v; if (c.locked) force.push(c.key); }
      });
      let look = null;
      if (L.look && typeof L.look === 'object') {
        const parts = Object.entries(L.look);
        if (parts.length) {
          look = {};
          parts.forEach(([part, spec], j) => {
            const base = norm(spec?.c) || norm(opts.base ? opts.base(spec) : null) || '#ffffff';
            look[part] = { ...spec, c: toward(base, bySat[(li + j) % bySat.length]) };
          });
          if (JSON.stringify(look) === JSON.stringify(L.look)) look = null;
        }
      }
      const n = Object.keys(set).length + (look ? 1 : 0);
      if (n) out.layers.push({ id: L.id, name: L.name, set, force, look });
      out.changed += n;
    });
    return out;
  }

  // One palette from several lists (each list's first colors count most): near colors pool together, then the most
  // common distinct ones, at most n.
  function merge(lists, n = 5) {
    const pool = [];
    for (const list of lists || []) clean(list).forEach((c, i) => pool.push({ c, w: 1 / (i + 1) }));
    const groups = [];
    for (const x of pool) {
      const g = groups.find((y) => dist(y.c, x.c) < 40);
      if (g) g.w += x.w; else groups.push({ c: x.c, w: x.w });
    }
    groups.sort((a, b) => b.w - a.w);
    const out = [];
    for (const g of groups) { if (out.length >= n) break; if (out.every((c) => dist(c, g.c) > 48)) out.push(g.c); }
    return out;
  }

  return { HEX, SUBTLE, norm, lum, sat, mix, dist, clean, sources, plan, merge };
})();
if (typeof module !== 'undefined') module.exports = ProjLookCore;
else window.ProjLookCore = ProjLookCore;
