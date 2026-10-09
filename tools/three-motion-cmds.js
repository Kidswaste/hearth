// Chat commands for the Lab's motion-design kit (tools/three-motion.js): one open entry (/motion-kit, or Alt+X / X → Motion
// in the Lab) and a command per family for what you'd type most (/kinetic, /camera-move, /logo-reveal, /end-card,
// /hearth-on-screen…). Area "Three.js Lab" (/help motion). Registered after every script has loaded; a name another
// stream already took is skipped (the family stays reachable through /motion-kit <preset>). Ctrl+K actions at the bottom.
(() => {
  const AREA = 'Three.js Lab';
  const M = () => ThreeMotion;
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, q) => { const s = String(q || '').toLowerCase(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => String(x.value).toLowerCase().includes(s)).slice(0, 14); };
  const lab = async () => { await ThreeLab.cmd({ show: true }); return M(); };
  const fam = (kind) => M().TEMPLATES.filter((t) => t.motion.kind === kind);
  const presetsOf = (kind) => fam(kind).map((t) => ({ value: t.motion.preset, hint: t.name }));
  // "slam made with hearth" → the template whose preset / name the leading words are, and the rest as words
  function split(args, kind = null) {
    const w = words(args);
    for (let k = Math.min(4, w.length); k >= 1; k--) {
      const head = w.slice(0, k).join(' ');
      const t = M().TEMPLATES.find((x) => (!kind || x.motion.kind === kind) && [x.motion.preset, x.name.toLowerCase(), x.name.replace(/^[^:]+:\s*/, '').toLowerCase()].includes(head.toLowerCase()));
      if (t) return { t, rest: w.slice(k).join(' ') };
    }
    return { t: null, rest: String(args || '').trim() };
  }
  const wordKey = (t) => M().SPEC[t.motion.kind].fields.find((f) => f.kind === 'text' && !f.opt)?.name;
  const say = (r) => `Added **${r.added}** · its knobs are in Sliders (Save / Shuffle / keyframes work), Alt+N shows it as one node.`;
  // "at 4.5" / "for 3 s" (for /motion-seq)
  const timeArg = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };

  const DEFS = [
    { name: 'motion-kit', area: AREA, args: '[preset] [words]', desc: 'The motion-design kit: Hearth on screen, kinetic type, camera moves, logo reveals, end cards (no args: the picker, also Alt+X)',
      keywords: 'motion design intro promo kinetic typography ui mockup device camera logo end card cta after effects', examples: ['/motion-kit', '/motion-kit cascade Made with Hearth', '/motion-kit laptop', '/motion-kit dolly in'],
      complete: (a) => opts(M().TEMPLATES.map((t) => ({ value: t.motion.preset, hint: t.name })), a),
      run: async (args) => {
        await lab();
        if (!String(args || '').trim()) { M().openPicker(); return ''; }
        const { t, rest } = split(args);
        if (!t) { const f = M().find(args); if (!f) { M().openPicker(args); return `Nothing called “${args}”: the picker is open on it.`; } return say(await M().add(f)); }
        const key = wordKey(t);
        return say(await M().add(t, { over: rest && key ? { [key]: rest } : {} }));
      } },
    { name: 'hearth-on-screen', aliases: ['on-screen'], area: AREA, args: '[layout] [laptop|phone|browser|tablet|glass] [here] [words…]', desc: 'Put Hearth on screen: a whole shot in a new sketch (your newest captures or Hearth drawn, as 3D screens, a cursor, a title, a camera move)',
      keywords: 'mockup device screenshots ui cards intro', examples: ['/hearth-on-screen', '/hearth-on-screen parallax glass', '/hearth-on-screen single laptop Your AIs, one window'],
      complete: (a) => opts(['single', 'stack', 'parallax', 'explode', 'fly-in', 'carousel', 'wall', 'hero', 'zoom', 'fan', 'feed', 'split', 'turntable', 'elements', 'laptop', 'phone', 'browser', 'tablet', 'glass', 'here'], words(a).pop() || ''),
      run: async (args) => {
        await lab();
        const w = words(args);
        const LAY = Object.keys({ single: 1, stack: 1, parallax: 1, explode: 1, 'fly-in': 1, carousel: 1, wall: 1, hero: 1, zoom: 1, fan: 1, feed: 1, split: 1, turntable: 1, elements: 1 });
        const FR = ['laptop', 'phone', 'browser', 'tablet', 'glass', 'none'];
        const layout = w.find((x) => LAY.includes(x.toLowerCase())) || null; const frame = w.find((x) => FR.includes(x.toLowerCase())) || null; const here = w.some((x) => /^here$/i.test(x));
        const text = w.filter((x) => x !== layout && x !== frame && !/^here$/i.test(x)).join(' ');
        const r = await M().hearthOnScreen({ layout, frame, here, words: text || null });
        return `**${r.sketch}**: ${r.layers.join(' · ')}\nPictures: ${r.pictures.join(', ')} · /motion-words changes the title · Alt+X for more.`;
      } },
    { name: 'kinetic', aliases: ['kinetic-type'], area: AREA, args: '<preset> <words>', desc: 'Kinetic type: words with a per-letter animation, fitted to the frame (type-on, cascade, split, slam, wave, scramble, breathe…)',
      keywords: 'typography text animate letters title', examples: ['/kinetic slam Two AIs. One app.', '/kinetic word-by-word Make it / react / to / the / beat'],
      complete: (a) => (words(a).length <= 1 && !/\s$/.test(a || '') ? opts(presetsOf('type'), a) : []),
      run: async (args) => { await lab(); const { t, rest } = split(args, 'type'); const tt = t || M().byId('mo-type-cascade'); return say(await M().add(tt, { over: (t ? rest : args) ? { text: t ? rest : args } : {} })); } },
    { name: 'type-3d', area: AREA, args: '<spin-in|tumble|fly-through|swing|domino|orbit> <words>', desc: '3D type: letters with depth animating in one by one (they follow a camera layer)',
      complete: (a) => (words(a).length <= 1 && !/\s$/.test(a || '') ? opts(presetsOf('type3d'), a) : []),
      run: async (args) => { await lab(); const { t, rest } = split(args, 'type3d'); const tt = t || M().byId('mo-type3d-spin-in'); return say(await M().add(tt, { over: (t ? rest : args) ? { text: t ? rest : args } : {} })); } },
    { name: 'camera-move', aliases: ['cam-move'], area: AREA, args: '<move> [amount 1.5] [for 4 s] [at 2]', desc: 'A camera move as a layer (dolly, orbit, crane, truck, whip pan, rack focus, handheld, zoom punch, vertigo…)',
      keywords: 'shot dolly orbit crane pan zoom focus shake', examples: ['/camera-move dolly-in', '/camera-move whip-pan at 2', '/camera-move rack-focus for 2 s'],
      complete: (a) => (words(a).length <= 1 && !/\s$/.test(a || '') ? opts(presetsOf('camera'), a) : []),
      run: async (args) => {
        await lab();
        const { t } = split(args.replace(/\b(amount|for|at)\b.*$/i, '').trim(), 'camera');
        if (!t) { M().openPicker('camera'); return 'Pick a move (the shot list is open).'; }
        const over = {};
        const amt = timeArg(args, /\bamount\s+(-?[\d.]+)/i); const len = timeArg(args, /\bfor\s+([\d.]+)\s*s?/i); const at = timeArg(args, /\bat\s+([\d.]+)/i);
        if (amt != null) over.amount = amt; if (len != null) over.length = len; if (at != null) over.start = at;
        return say(await M().add(t, { over }));
      } },
    { name: 'shot-list', area: AREA, desc: 'The shot list: every camera move in the picker (Enter adds one as a layer)', keywords: 'camera moves', run: async () => { await lab(); M().openPicker('camera'); return ''; } },
    { name: 'logo-reveal', area: AREA, args: '[line draw|extrude|slam|burst|glitch|particles|molten|stamp] [flame|anvil|both]', desc: 'A logo reveal of the Hearth flame or the Forgeheart anvil (line draw, 3D spin, slam with sparks…)',
      keywords: 'logo intro outro brand flame anvil', examples: ['/logo-reveal', '/logo-reveal slam anvil', '/logo-reveal particles'],
      complete: (a) => opts(['line draw', 'extrude', 'slam', 'burst', 'glitch', 'particles', 'molten', 'stamp', 'flame', 'anvil', 'both'], words(a).pop() || ''),
      run: async (args) => {
        await lab();
        const a = String(args || '').toLowerCase();
        const style = ['line draw', 'extrude', 'slam', 'burst', 'glitch', 'particles', 'molten', 'stamp'].find((x) => a.includes(x)) || (a.includes('line') ? 'line draw' : a.includes('3d') || a.includes('spin') ? 'extrude' : null);
        const mark = ['both', 'anvil', 'flame', 'astra'].find((x) => a.includes(x)) || null;
        const base = M().TEMPLATES.find((t) => t.motion.kind === 'logo' && (!style || t.motion.values.style === style) && (!mark || t.motion.values.mark === mark)) || M().TEMPLATES.find((t) => t.motion.kind === 'logo' && (!style || t.motion.values.style === style)) || M().byId('mo-logo-flame-line');
        const over = {}; if (style) over.style = style; if (mark) { over.mark = mark; if (mark === 'anvil' && base.motion.values.mark !== 'anvil') over.word = 'FORGEHEART'; }
        return say(await M().add(base, { over }));
      } },
    { name: 'end-card', aliases: ['endcard'], area: AREA, args: '[forge|light|molten|duo|minimal] [button text]', desc: 'An end card: the name, a line and a call to action (Try Hearth, Follow for more, Link in bio…)',
      keywords: 'outro cta call to action subscribe follow', examples: ['/end-card', '/end-card light Link in bio', '/end-card duo Try Hearth'],
      complete: (a) => (words(a).length <= 1 && !/\s$/.test(a || '') ? opts(['forge', 'light', 'molten', 'duo', 'minimal'], a) : []),
      run: async (args) => { await lab(); const w = words(args); const st = ['forge', 'light', 'molten', 'duo', 'minimal'].includes((w[0] || '').toLowerCase()) ? w.shift().toLowerCase() : null; const t = M().TEMPLATES.find((x) => x.motion.kind === 'endcard' && x.motion.preset === (st || 'forge')); const cta = w.join(' '); return say(await M().add(t, { over: cta ? { cta } : {} })); } },
    { name: 'brand-look', area: AREA, args: '[forge gradient|molten|aurora|glow orb|grid|chrome|embers|grain|light sweep|vignette|spotlight|flare|bokeh]', desc: 'Forgeheart brand looks: animated backdrops (gradient, molten, aurora…) and overlays (grain, light sweep, embers, glow…)',
      keywords: 'background backdrop grain glow texture gradient', examples: ['/brand-look', '/brand-look grain', '/brand-look molten'],
      complete: (a) => opts(presetsOf('brand'), a),
      run: async (args) => { await lab(); const t = M().find(args || 'forge gradient', 'brand') || M().byId('mo-brand-forge-gradient'); return say(await M().add(t)); } },
    { name: 'cursor-path', area: AREA, args: '[arrow|hand|dot] [x,y,click; x,y; …]', desc: 'A cursor that glides along a path and clicks (points in 0..1 of the frame; no path: a tour of the safe area)',
      examples: ['/cursor-path', '/cursor-path hand 0.2,0.8; 0.5,0.5,click; 0.7,0.3,click'],
      run: async (args) => { await lab(); const w = words(args); const st = ['arrow', 'hand', 'dot'].includes((w[0] || '').toLowerCase()) ? w.shift().toLowerCase() : 'arrow'; const path = w.join(' '); if (path && !M().parseCursorPath(path)) return 'The path is points like 0.2,0.8; 0.5,0.5,click (two or more).'; return say(await M().add(M().byId(`mo-cursor-${st}`), { over: path ? { path } : {} })); } },
    { name: 'hearth-ui', area: AREA, args: '[layout or device]', desc: 'One layer of Hearth\'s screens in 3D: floating card, laptop, phone, browser, glass panels, parallax, explode, fly-in, carousel, wall…',
      examples: ['/hearth-ui laptop', '/hearth-ui explode', '/hearth-ui elements'],
      complete: (a) => opts(presetsOf('ui'), a),
      run: async (args) => { await lab(); const t = M().find(args || 'single', 'ui') || M().byId('mo-ui-single'); return say(await M().add(t)); } },
    { name: 'motion-words', area: AREA, args: '<words>', desc: 'New words for the selected motion layer (kinetic type, 3D type, logo name, end card button…) — its animation stays',
      examples: ['/motion-words Your AIs / one window'],
      run: async (args) => { await lab(); if (!String(args || '').trim()) return 'Type the new words after /motion-words.'; const r = await M().handle({ op: 'words', text: args }); if (!r.ok) throw new Error(r.error); return `“${args}” on **${r.value.layer}**.`; } },
    { name: 'motion-seq', area: AREA, args: '<preset> [words] [at 4.5] [for 3 s]', desc: 'A motion layer over a range of the Lab sequence (an overlay at the playhead): kinetic type, a camera move, a logo…',
      examples: ['/motion-seq slam Hearth at 2', '/motion-seq dolly in for 4 s'],
      complete: (a) => opts(M().TEMPLATES.map((t) => ({ value: t.motion.preset, hint: t.name })), a),
      run: async (args) => {
        await lab();
        const at = timeArg(args, /\bat\s+([\d.]+)/i); const secs = timeArg(args, /\bfor\s+([\d.]+)\s*s?/i);
        const { t, rest } = split(args.replace(/\b(at|for)\s+[\d.]+\s*s?\b/gi, '').trim());
        if (!t) return 'Which preset? (/motion-list)';
        const key = wordKey(t);
        const r = await M().toSequence(t, { over: rest && key ? { [key]: rest } : {}, at, secs });
        return `**${t.name}** over the sequence from ${r.at.toFixed(2)} s.`;
      } },
    { name: 'motion-intro', area: AREA, args: '[9:16|16:9|1:1|4:5] [title words]', desc: 'A sample motion intro as a Lab sequence: logo reveal → Hearth on screen with a title and a camera move → end card (then ⇪ renders it)',
      keywords: 'promo teaser social intro sequence', examples: ['/motion-intro', '/motion-intro 16:9'],
      run: async (args) => { await lab(); const w = words(args); const fmt = w.find((x) => /^(9:16|16:9|1:1|4:5)$/.test(x)) || '9:16'; const text = w.filter((x) => x !== fmt).join(' '); const r = await M().sampleSequence({ format: fmt, words: text || null }); return `Sequence **${r.sequence}** (${fmt}): ${r.scenes.join(' → ')}. Space plays it, ⇪ renders it (/sequence-render ${fmt}).`; } },
    { name: 'motion-list', area: AREA, args: '[ui|type|type3d|camera|logo|brand|endcard|cursor]', desc: 'Every motion preset, by family',
      complete: (a) => opts(M().KINDS, a),
      run: (args) => { const k = String(args || '').trim().toLowerCase(); const groups = new Map(); for (const t of M().TEMPLATES) { if (k && t.motion.kind !== k && !t.cat.toLowerCase().includes(k)) continue; if (!groups.has(t.cat)) groups.set(t.cat, []); groups.get(t.cat).push(t.motion.preset); } return [...groups].map(([c, l]) => `- **${c}** (${l.length}): ${l.join(', ')}`).join('\n') || 'Nothing in that family.'; } },
  ];
  const register = () => {
    for (const d of DEFS) {
      if (Commands.get?.(d.name)) continue; // another stream owns the name: /motion-kit <preset> still reaches it
      const aliases = (d.aliases || []).filter((a) => !Commands.get?.(a));
      Commands.register({ ...d, aliases });
    }
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();

  // Ctrl+K (each also through /do)
  const act = (fn) => async () => { try { await ThreeLab.cmd({ show: true }); const r = await fn(); if (typeof r === 'string' && r) toast(r, { timeout: 2600 }); } catch (err) { toast(err.message, { type: 'error' }); } };
  for (const [label, fn] of [
    ['Lab: Motion design kit (Alt+X)', () => M().openPicker()],
    ['Lab: Put Hearth on screen', async () => { const r = await M().hearthOnScreen(); return `${r.sketch}: ${r.layers.length} layers`; }],
    ['Lab: Shot list (camera moves)', () => M().openPicker('camera')],
    ['Lab: Kinetic type…', () => M().openPicker('type:')],
    ['Lab: Logo reveal', async () => (await M().add('mo-logo-flame-line')).added],
    ['Lab: End card', async () => (await M().add('mo-endcard-forge')).added],
    ['Lab: Motion intro sequence', async () => (await M().sampleSequence()).sequence],
  ]) AppUI.addAction?.(label, act(fn));
})();
