// 🧩 Effect building blocks (round 134, blocks134): the pure part (no DOM; loads in Node for the check's sums).
// Every block is a piece the Lab already has (docs/upgrades/blocks134.md): a generator is a ready-made layer template
// (a ◇ shader starter, a ✦ particle preset), an effect is one of the FX pack's filter layers. Nothing new runs in the
// preview: a block only names which existing piece to add, with which slider values, in which order.
//   BLOCKS                         → [{ id, name, kind: 'gen' | 'fx', src, desc }]
//   byId(id) · layerName(block) · blockOfName(layerName, custom)
//   clampValues(spec, values)      → the values that fit the sliders (numbers clamped, colors #rrggbb, choices listed)
//   paletteValues(spec, palette)   → the color sliders in the palette's colors (dark → light in slider order)
//   plan(chain, { custom, max })   → { steps: [{ block, values }], errors } (a custom block expands into its chain)
//   reorder(ids, from, to)         → the list with one moved
//   askText({ mood, blocks, palette, selected, custom }) · estimate(chars)   ✦ Combine for me (cost first)
//   mine(name, chain, all)         → a saved custom block · cleanMine(list)
const BlocksCore = (() => {
  const BLOCKS = [
    { id: 'noise', name: 'Noise field', kind: 'gen', src: 'shader-marble', desc: 'Flowing domain-warped noise, like ink in water' },
    { id: 'bloom', name: 'Bloom / glow', kind: 'fx', src: 'bloom', desc: 'Soft glow around bright parts, pumping on kicks' },
    { id: 'trails', name: 'Feedback trails', kind: 'fx', src: 'trails', desc: 'Moving things leave fading trails' },
    { id: 'kaleido', name: 'Kaleidoscope', kind: 'fx', src: 'kaleido', desc: 'Mirrored wedges around the center' },
    { id: 'particles', name: 'Particles', kind: 'gen', src: 'particles-embers', desc: 'GPU sparks floating up and fading' },
    { id: 'displace', name: 'Displacement', kind: 'fx', src: 'displace', desc: 'The picture warps along flowing noise' },
    { id: 'chromatic', name: 'Chromatic split', kind: 'fx', src: 'rgbsplit', desc: 'Red, green and blue pulled apart on kicks' },
    { id: 'grain', name: 'Grain / film', kind: 'fx', src: 'grain', desc: 'Fine animated film grain' },
    { id: 'pixelate', name: 'Pixelate', kind: 'fx', src: 'pixelate', desc: 'Big square pixels' },
    { id: 'mirror', name: 'Mirror', kind: 'fx', src: 'mirror', desc: 'Reflect half (or a quarter) of the frame' },
    { id: 'ramp', name: 'Colour ramp', kind: 'fx', src: 'gradientmap', desc: 'Brightness mapped onto a 4-colour gradient' },
    { id: 'strobe', name: 'Beat strobe', kind: 'fx', src: 'strobe', desc: 'Flashes or blackouts on the beat' },
  ];
  const MARK = '🧩 ';
  const HEX = /^#[0-9a-f]{6}$/i;
  const byId = (id) => BLOCKS.find((b) => b.id === String(id || '').trim().toLowerCase()) || null;
  const layerName = (b) => `${MARK}${b.name}`;
  // a 🧩 layer's block: by its name ("🧩 Bloom / glow 2" → bloom); a saved block's layers carry its own block names
  function blockOfName(name, custom = []) {
    const s = String(name || '');
    if (!s.startsWith(MARK)) return null;
    const bare = s.slice(MARK.length).replace(/ \d+$/, '').trim().toLowerCase();
    return BLOCKS.find((b) => b.name.toLowerCase() === bare) || (custom || []).find((c) => c.name.toLowerCase() === bare) || null;
  }

  // ---------- values ----------
  // spec: [{ key, kind: 'number' | 'color' | 'bool' | 'choice', value, min, max, options }]
  function clampValues(spec, values) {
    const out = {};
    for (const s of spec || []) {
      if (!values || !(s.key in values)) continue;
      const v = values[s.key];
      if (s.kind === 'number') {
        let x = Number(v);
        if (!Number.isFinite(x)) continue;
        if (Number.isFinite(s.min)) x = Math.max(s.min, x);
        if (Number.isFinite(s.max)) x = Math.min(s.max, x);
        out[s.key] = Math.round(x * 1000) / 1000;
      } else if (s.kind === 'color') {
        const h = String(v || '').trim().toLowerCase();
        if (HEX.test(h)) out[s.key] = h;
      } else if (s.kind === 'bool') out[s.key] = v === true || v === 'true' || v === 1 || v === 'on';
      else if (s.kind === 'choice') { if (!s.options?.length || s.options.includes(String(v))) out[s.key] = String(v); }
    }
    return out;
  }
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = (h) => { const [r, g, b] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const sat = (h) => { const c = rgb(h); return (Math.max(...c) - Math.min(...c)) / 255; };
  function paletteValues(spec, palette) {
    const pal = [...new Set((palette || []).map((c) => String(c || '').toLowerCase()).filter((c) => HEX.test(c)))];
    const keys = (spec || []).filter((s) => s.kind === 'color').map((s) => s.key);
    if (!pal.length || !keys.length) return {};
    const dark = pal.slice().sort((a, b) => lum(a) - lum(b));
    if (keys.length === 1) return { [keys[0]]: pal.slice().sort((a, b) => sat(b) - sat(a) || lum(b) - lum(a))[0] };
    return Object.fromEntries(keys.map((k, i) => [k, dark[Math.round((i * (dark.length - 1)) / (keys.length - 1))]]));
  }

  // ---------- a chain ----------
  function plan(chain, { custom = [], max = 8 } = {}) {
    const steps = []; const errors = [];
    for (const c of Array.isArray(chain) ? chain : []) {
      const id = typeof c === 'string' ? c : c?.block ?? c?.id;
      const b = byId(id);
      if (b) { steps.push({ block: b.id, values: (c && typeof c === 'object' && c.values && typeof c.values === 'object') ? { ...c.values } : {} }); continue; }
      const mineB = (custom || []).find((x) => x.id === id || x.name.toLowerCase() === String(id || '').toLowerCase());
      if (mineB) { for (const s of mineB.chain) if (byId(s.block)) steps.push({ block: s.block, values: { ...(s.values || {}) } }); continue; }
      errors.push(`no block "${id}"`);
    }
    if (steps.length > max) { errors.push(`at most ${max} blocks (kept the first ${max})`); steps.length = max; }
    return { steps, errors };
  }
  function reorder(ids, from, to) {
    const a = ids.slice();
    if (from < 0 || from >= a.length) return a;
    const [x] = a.splice(from, 1);
    a.splice(Math.max(0, Math.min(a.length, to)), 0, x);
    return a;
  }

  // ---------- ✦ Combine for me (the director, cost first) ----------
  const fmtSpec = (s) => (s.kind === 'number' ? `${s.key} ${s.min ?? '?'}–${s.max ?? '?'} (${s.value})` : s.kind === 'color' ? `${s.key} #hex` : s.kind === 'choice' && s.options?.length ? `${s.key} ${s.options.slice(0, 5).join('|')}` : `${s.key} (${s.value})`);
  function askText({ mood = '', blocks = [], palette = [], selected = '', custom = [] } = {}) {
    const lines = [
      `✦ Combine blocks · mood: "${String(mood).replace(/\s+/g, ' ').trim().slice(0, 160)}"`,
      'Pick 3–5 of these blocks for that mood, their order (bottom → top) and slider values, and build them with ONE call:',
      'three_do {cmd: "blocks", chain: [{block: "<id>", values: {<slider>: <value>}}, …]}',
      'Generators are layers; effects change everything below them. Colors come from the palette unless you set them. Then say in one line what you made.',
      'Blocks (id (kind): what it does · sliders):',
      ...blocks.map((b) => `- ${b.id} (${b.kind === 'gen' ? 'generator' : 'effect'}): ${b.desc} · ${(b.spec || []).slice(0, 5).map(fmtSpec).join(', ')}`),
    ];
    if (custom.length) lines.push(`The owner's own blocks (use by id): ${custom.map((c) => `${c.id} = ${c.chain.map((s) => s.block).join(' → ')}`).join(' · ')}`);
    if (palette.length) lines.push(`Palette: ${palette.join(' ')}`);
    if (selected) lines.push(`Built above the selected layer "${selected}".`);
    return lines.join('\n');
  }
  const estimate = (chars) => Math.round(1800 + Number(chars || 0) / 3.6);

  // ---------- my blocks (saved chains) ----------
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'block';
  function mine(name, chain, all = []) {
    const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nm) throw new Error('A name, please.');
    const steps = plan(chain).steps;
    if (!steps.length) throw new Error('There are no blocks in the chain to save.');
    let id = `my-${slug(nm)}`; let n = 2;
    while ((all || []).some((x) => x.id === id) || byId(id)) { id = `my-${slug(nm)}-${n}`; n += 1; }
    return { id, name: nm, chain: steps, at: Date.now() };
  }
  const cleanMine = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.chain) && x.chain.some((s) => byId(s?.block)))
    .map((x) => ({ id: x.id, name: x.name, chain: x.chain.filter((s) => byId(s?.block)).map((s) => ({ block: s.block, values: s.values && typeof s.values === 'object' ? s.values : {} })), at: Number(x.at) || 0 }));

  return { BLOCKS, MARK, byId, layerName, blockOfName, clampValues, paletteValues, plan, reorder, askText, estimate, mine, cleanMine, lum, sat };
})();
if (typeof module !== 'undefined') module.exports = BlocksCore;
else if (typeof window !== 'undefined') window.BlocksCore = BlocksCore;
