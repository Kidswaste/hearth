// Portable project preferences. No filesystem paths or generated executable code.
(function(root, make) { if (typeof module === 'object') module.exports = make(); else root.ProjectWorkspaceCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const PERSONAS = {
    partner: ['Creative partner', 'Be a candid, concise creative partner. Help me finish small, strong pieces. Offer one useful next step.'],
    director: ['Art director', 'Be a discerning art director: focus on composition, motion, story and a distinctive visual identity. Be concrete and concise.'],
    producer: ['Music producer', 'Be a music producer: focus on sound, groove, arrangement and finishing a playable demo. Offer specific, practical feedback.'],
    builder: ['Game builder', 'Be a game designer and engineer: make a small playable loop, clear feedback and reliable code. Help me finish before expanding.'],
    coach: ['Finish-line coach', 'Be a supportive but frank creative coach. Break work into small achievable steps, notice blockers and help me finish. Avoid motivational filler.'],
  };
  const ICONS = { projects:'M3 5h7l2 3h9v13H3ZM3 5V3h7l2 2', ship:'m12 2 5 10 5 6-8-2-2 6-2-6-8 2 5-6 5-10ZM10 10h4M7 19l-2 3M17 19l2 3', brushes:'m4 2 16 15-3 3L2 4Zm16 0L2 17l3 3L22 4ZM3 18l-1 4 4-1M18 18l4 4', spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z', music:'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1M20 16c0 4-6 4-6 1s6-4 6-1', scene:'m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10', board:'M3 3h7v10H3ZM14 3h7v6h-7ZM14 13h7v8h-7ZM3 17h7v4H3Z', chat:'M4 4h16v12H9l-5 4V4Zm4 5h8M8 12h5', plus:'M12 4v16M4 12h16', life:'M12 3 4 7v14l8-4 8 4V7l-8-4Zm0 0v14M8 10l2 2 5-5' };
  const plugins = value => [...new Set((Array.isArray(value) ? value : ['Serum 2','Vital']).filter(v => ['Serum 2','Vital'].includes(v)))];
  function workspace(value = {}) { return { ...value, v: 1, persona: PERSONAS[value.persona] ? value.persona : 'partner', plugins: plugins(value.plugins), description: String(value.description || '').slice(0, 500) }; }
  const key = id => { if (!/^[\w-]{1,100}$/.test(id)) throw Error('Invalid project id'); return 'workbench-' + id; };
  function frontpage(value = {}) {
    const num = (v, d, lo, hi) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
    const color = (v, d) => /^#[\da-f]{6}$/i.test(v || '') ? v : d;
    return { shape: ['orbit','crystal','wave'].includes(value.shape) ? value.shape : 'orbit', color: color(value.color, '#ff9866'), accent: color(value.accent, '#db78ff'), speed: num(value.speed,.2,.03,.6), count: Math.round(num(value.count,18,6,32)), title: String(value.title || 'Ideas in orbit').slice(0,60) };
  }
  return { PERSONAS, ICONS, plugins, workspace, key, frontpage };
});
