// Chat commands for the Lab's FX pack (filters, layer templates, looks, palettes, trigger presets, animations,
// eases, blends). They register after every script has loaded and skip any name another stream already took,
// so e.g. /look stays the Lab's own if it has one (ours is always reachable as /look-apply).
(() => {
  const AREA = 'Three.js Lab';
  const sug = (kind, args, n = 14) => {
    const q = String(args || '').toLowerCase().replace(/^--?\w+\s*/, '').trim();
    return ThreeFX.items(kind).filter((it) => !q || `${it.name} ${it.id} ${it.cat}`.toLowerCase().includes(q)).slice(0, n).map((it) => ({ value: it.name, hint: it.cat }));
  };
  // "/x name" applies the best match; "/x" alone opens the picker on that tab
  const applyCmd = (kind, { alt = /(^|\s)--(only|top|colors)\b/ } = {}) => async (args) => {
    const altOn = alt.test(args);
    const text = args.replace(alt, ' ').trim();
    if (!text) { ThreeFX.openPicker(kind); return ''; }
    const it = ThreeFX.find(kind, text);
    if (!it) return `Nothing called “${text}”. Try \`/fx-list ${kind}\` or \`/fx-picker ${kind}\` to browse.`;
    return ThreeFX.apply(it, { alt: altOn });
  };
  const DEFS = [
    { name: 'fx', args: '[filter] [--top]', desc: 'Add a filter layer above the selected layer (--top: above everything); alone: the FX picker', complete: (a) => sug('filter', a), run: applyCmd('filter', { alt: /(^|\s)--top\b/ }) },
    { name: 'fx-list', args: '[filters|layers|looks|palettes|triggers|animate|eases|blends] [category]', desc: 'List the FX pack (by kind and category)',
      complete: (a) => (a.includes(' ') ? [] : ['filters', 'layers', 'looks', 'palettes', 'triggers', 'animate', 'eases', 'blends'].filter((k) => k.startsWith(a.toLowerCase())).map((k) => ({ value: k }))),
      run: (args) => {
        const [k0, ...rest] = args.trim().split(/\s+/);
        const kinds = { filters: 'filter', filter: 'filter', layers: 'layer', layer: 'layer', templates: 'layer', looks: 'look', look: 'look', palettes: 'palette', palette: 'palette', triggers: 'trigger', trigger: 'trigger', animate: 'animate', animations: 'animate', eases: 'ease', ease: 'ease', blends: 'blend', blend: 'blend' };
        const kind = kinds[(k0 || '').toLowerCase()] || 'filter';
        const cat = (kinds[(k0 || '').toLowerCase()] ? rest.join(' ') : args).trim().toLowerCase();
        const list = ThreeFX.items(kind).filter((it) => !cat || it.cat.toLowerCase().includes(cat) || it.name.toLowerCase().includes(cat));
        if (!list.length) return `Nothing in ${kind}s matches “${cat}”.`;
        const groups = new Map();
        for (const it of list) { if (!groups.has(it.cat)) groups.set(it.cat, []); groups.get(it.cat).push(it.name); }
        return `**${list.length} ${ThreeFX.KIND_LABEL[kind].toLowerCase()}${list.length === 1 ? '' : 's'}**\n${[...groups].map(([c, names]) => `- **${c}** (${names.length}): ${names.join(', ')}`).join('\n')}`;
      } },
    { name: 'template', aliases: ['layer-add'], args: '[template] [--above]', desc: 'Add a ready-made layer (visualizer, background, text, 3D…); alone: browse them', complete: (a) => sug('layer', a), run: applyCmd('layer', { alt: /(^|\s)--above\b/ }) },
    { name: 'look-apply', aliases: ['look'], args: '[look] [--colors]', desc: 'Apply a look: palette + recolor the selected layer + its filter layers (--colors: colors only)', complete: (a) => sug('look', a), run: applyCmd('look', { alt: /(^|\s)--colors\b/ }) },
    { name: 'palette', args: '[palette] [--only]', desc: 'Set the sketch palette and recolor the selected layer (--only: just the palette)', complete: (a) => sug('palette', a), run: applyCmd('palette', { alt: /(^|\s)--only\b/ }) },
    { name: 'trigger-preset', aliases: ['triggers-preset'], args: '[genre or behavior]', desc: 'Set the ⚡ triggers for a style of music or a behavior (busy, calm, kick only…)', complete: (a) => sug('trigger', a), run: applyCmd('trigger') },
    { name: 'animate', args: '[animation]', desc: 'One-click keyframes for the selected layer (bounce in, heartbeat, punch zoom…)', complete: (a) => sug('animate', a), run: applyCmd('animate') },
    { name: 'ease', args: '[ease]', desc: 'Make every keyframe of the selected layer use an ease (bounce, elastic, expo out…)', complete: (a) => sug('ease', a), run: applyCmd('ease') },
    { name: 'blend', args: '[preset]', desc: 'Blend preset for the selected layer (glow, screen, multiply, hue only…)', complete: (a) => sug('blend', a), run: applyCmd('blend') },
    { name: 'surprise', aliases: ['random-fx'], args: '[filter|layer|look|palette]', desc: 'Apply a random filter (or layer, look, palette)', complete: () => ['filter', 'layer', 'look', 'palette'].map((v) => ({ value: v })),
      run: (args) => ThreeFX.surprise({ layer: 'layer', layers: 'layer', look: 'look', looks: 'look', palette: 'palette', palettes: 'palette' }[args.trim().toLowerCase()] || 'filter') },
    { name: 'fx-picker', aliases: ['effects'], args: '[kind]', desc: 'Open the searchable FX picker (also X in the Lab)', complete: () => ThreeFX.TABS.map(([id, label]) => ({ value: id, hint: label })),
      run: (args) => { ThreeLab.act('noop'); setTimeout(() => ThreeFX.openPicker(args.trim() || 'add'), 120); return ''; } },
  ];
  function registerAll() {
    if (typeof Commands === 'undefined') return;
    for (const d of DEFS) {
      const aliases = (d.aliases || []).filter((a) => !Commands.get(a));
      // a name another stream owns (/template, /palette) stays reachable as its first free alias or /fx-<name>
      const name = Commands.get(d.name) ? [...aliases, `fx-${d.name}`].find((n) => !Commands.get(n)) : d.name;
      if (!name) continue;
      Commands.register({ ...d, name, aliases: aliases.filter((a) => a !== name), area: AREA });
    }
  }
  registerAll(); // right away: with deferred scripts a timeout would now run after addons-cmds.js and lose /ease to the Kit
})();
