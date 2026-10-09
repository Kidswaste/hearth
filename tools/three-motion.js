// The Lab's motion-design kit (round 9, "motion"): what the owner needs for a motion-design intro of Hearth for socials,
// with Claude and Astra jamming in the Lab. Five families of ready layers, each a node graph with one node (so the
// Nodes view shows it and its knobs are the Lab's sliders: Save, Shuffle, looks and keyframes work):
//   Hearth on screen  captures of Hearth (or Hearth drawn) as 3D cards, glass panels, laptop / phone / browser / tablet
//                     frames, parallax stacks, a screen exploding into its layers, UI elements flying in, a clicking cursor
//   Kinetic type      words with per-letter animation (type-on, cascade, split, slam, wave, scramble, breathe…), fitted
//                     to the frame's safe zone, timed to the song's hit markers / beats when there's a song (else seconds)
//   Camera            moves as layers (dolly, orbit, crane, whip pan, rack focus, handheld, zoom punch…): a rig the 3D
//                     layers follow, or the whole picture when there's nothing 3D under it — "the shot list"
//   Brand             Forgeheart backgrounds and overlays (gradients, molten, grain, glows, light sweeps) and logo
//                     reveals of the Hearth flame / Forgeheart anvil (icons.js) drawn as lines or extruded in 3D
//   End cards         the name, a line and a call to action
// The drawing lives in the Lab's sandbox (tools/three-sandbox.html, `motion.<kind>(P, opts)`, like filter()); this file
// is the catalog (templates in ThreeLayers.TEMPLATES, pack 'motion'), the node types, the Motion tab of the effects
// picker (X → Motion, or Alt+X), "Put Hearth on screen", the Lab sequence glue and the director's three_do motion.
// Everything is time-driven (the layer's own time on the timeline / in the sequence), not music-reactive, unless asked.
const ThreeMotion = (() => {
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map(q).join(', ')}]` : JSON.stringify(v));
  const norm = (s) => String(s || '').toLowerCase().trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MARK = '◭ '; // motion layers' names start with it (easy to spot in the layers list)

  // ---------- the knobs of each kind (one table: node fields, plain tweak() code, commands) ----------
  // n(name, value, min, max, label, group, step) · c(name, '#hex', label, group) · s(name, [options], value, label, group)
  // b(name, bool, label, group) · w(name, 'text', label, group): words / names (not a slider)
  const n = (name, value, min, max, label, group, step) => ({ name, type: 'num', value, min, max, label, group, ...(step ? { step } : {}) });
  const c = (name, value, label, group) => ({ name, type: 'color', value, label, group });
  const s = (name, options, value, label, group) => ({ name, kind: 'select', options, value, label, group, slider: true, widget: true });
  const b = (name, value, label, group) => ({ name, type: 'bool', value, label, group });
  const w = (name, value, label, group, opt = false) => ({ name, kind: 'text', type: 'text', value, label, group, slider: false, widget: true, ...(opt ? { opt: true } : {}) });
  const TIMING = (o = {}) => [
    n('start', o.start ?? 0.2, 0, 30, 'Starts at (s)', 'Timing', 0.05), n('speed', o.speed ?? 0.6, 0.05, 4, 'Each takes (s)', 'Timing', 0.05),
    n('stagger', o.stagger ?? 0.05, 0, 1.5, 'Gap between (s)', 'Timing', 0.01), n('hold', o.hold ?? 2.5, 0, 20, 'Holds (s)', 'Timing', 0.1),
    n('out', 0, 0, 60, 'Leaves at (s, 0 = stays)', 'Timing', 0.1),
  ];
  const TIMED = [s('timing', ['auto', 'markers', 'beats', 'seconds'], 'auto', 'Words land on', 'Timing'), n('every', 1, 0.25, 8, 'Beats per word', 'Timing', 0.25)];
  const FONTS = ['Oxanium', 'System', 'Impact', 'Serif', 'Mono', 'Rounded'];
  const FILLS = ['solid', 'gradient', 'gold', 'chrome', 'molten', 'outline'];
  const EASES = ['back', 'out', 'expo', 'inOut', 'elastic', 'bounce', 'smooth', 'linear'];

  // the presets of each family: [id, name, description, values, tags]
  const TYPE_PRESETS = [
    ['type-on', 'Type on', 'Letters appear one by one behind a blinking caret, like typing', { stagger: 0.055 }, 'typewriter typing caret'],
    ['cascade', 'Cascade', 'Letters drop in from above one after another and settle with a little overshoot', {}, 'drop fall'],
    ['split', 'Split', 'The words split open from the middle: each half slides in from its side', { speed: 0.9 }, 'center apart'],
    ['slam', 'Slam', 'Each word slams in from huge with a short shake', { speed: 0.3, stagger: 0.4 }, 'impact punch big'],
    ['wave', 'Wave', 'Letters rise in a wave and keep swaying gently', {}, 'sine float'],
    ['scramble', 'Scramble', 'Random glyphs flicker and resolve into the letters (decode)', { stagger: 0.035, speed: 0.55 }, 'decode hacker random'],
    ['breathe', 'Kerning breathe', 'The letters start wide apart, close in and keep breathing their spacing', { speed: 1.1, stagger: 0 }, 'tracking spacing letterspacing kerning'],
    ['pop', 'Pop', 'Letters pop up from nothing with a bounce', { speed: 0.45, stagger: 0.04 }, 'scale bubbly'],
    ['blur-in', 'Blur in', 'Letters come into focus from a blur', { speed: 0.8, stagger: 0.03 }, 'focus soft'],
    ['rise', 'Rise (mask)', 'Each line rises from behind an invisible edge', { speed: 0.75, stagger: 0.14 }, 'mask reveal line slide'],
    ['flip', 'Flip', 'Letters flip open like cards', { speed: 0.65 }, '3d card rotate'],
    ['tracking-in', 'Tracking in', 'Wide letters slide together into the word', { speed: 1.3, stagger: 0 }, 'letterspacing cinematic trailer'],
    ['glitch', 'Glitch', 'Letters jitter in with an RGB split, then hold still', { speed: 0.55, stagger: 0.025 }, 'digital rgb'],
    ['stagger-fade', 'Stagger fade', 'Words fade up one after another', { speed: 0.6, stagger: 0.22 }, 'calm elegant'],
    ['bounce', 'Bounce', 'Letters fall and bounce into place', { speed: 0.95 }, 'playful'],
    ['elastic', 'Elastic', 'Letters spring in sideways', { speed: 1.1, stagger: 0.04 }, 'spring'],
    ['spin-in', 'Spin in', 'Letters spin into place', { speed: 0.75 }, 'rotate'],
    ['word-by-word', 'Word by word', 'One word at a time, big in the middle (lands on the beats with a song)', { stagger: 0.45, speed: 0.12, size: 0.22 }, 'beat lyric one word kinetic'],
    ['highlight', 'Highlight', 'Words appear with a marker sweeping behind them', { stagger: 0.3, speed: 0.5, color: '#14110a' }, 'marker emphasis'],
    ['stretch', 'Stretch', 'Letters stretch tall and snap back', { speed: 0.7 }, 'squash elastic'],
    ['outline-fill', 'Outline to fill', 'Outlines draw first, then fill in', { speed: 1.0, stagger: 0.04 }, 'stroke line'],
    ['neon', 'Neon flicker', 'Letters flicker on like neon tubes', { speed: 0.8, stagger: 0.06, glow: 1.2 }, 'sign glow'],
    ['zoom-through', 'Zoom through', 'Words fly at you from the distance, one after another', { stagger: 0.6, speed: 0.35, size: 0.22 }, 'fly z depth'],
    ['stack', 'Stack', 'One word per line, sliding in from alternating sides', { stagger: 0.18, speed: 0.6 }, 'column poster'],
    ['count', 'Count up', 'The numbers in the words roll up from 0 (write "8,746 upgrades")', { speed: 1.6, stagger: 0 }, 'number counter stat'],
    ['marquee', 'Marquee', 'The words scroll across the frame in a loop', { stagger: 0.35, speed: 0.4 }, 'ticker scroll banner'],
    ['circle', 'Circle', 'The words go round a slowly turning circle', { stagger: 0.35, speed: 0.8 }, 'round badge spin'],
    ['wipe', 'Wipe reveal', 'Each line is wiped in from the left', { speed: 0.8, stagger: 0.2 }, 'wipe mask'],
    ['drop-in', 'Drop in', 'Words drop from above with a tilt', { speed: 0.7, stagger: 0.2 }, 'fall tilt'],
    ['slide-up', 'Slide up', 'Lines slide up and fade in', { speed: 0.7, stagger: 0.16 }, 'simple clean'],
    ['scale-down', 'Scale down', 'The words shrink from huge into place', { speed: 0.9, stagger: 0 }, 'zoom big'],
    ['shimmer', 'Shimmer', 'A gold glint keeps running across the letters', { speed: 0.5, stagger: 0.03 }, 'sheen glint shine'],
    ['jitter', 'Jitter (boil)', 'Hand-made boil: the letters wobble a little, eight times a second', { speed: 0.4, stagger: 0.03 }, 'stop motion handmade'],
  ];
  const TYPE3D_PRESETS = [
    ['spin-in', 'Spin in', '3D letters with depth spin into place one by one', {}, ''],
    ['tumble', 'Tumble', '3D letters tumble down and bounce', {}, 'fall'],
    ['fly-through', 'Fly through', '3D letters fly in from the distance', {}, 'depth z'],
    ['swing', 'Swing down', '3D letters swing down like signs on a hinge', {}, 'hinge'],
    ['domino', 'Domino', '3D letters tip up like dominoes', {}, 'tip'],
    ['orbit', 'Orbit in', '3D letters spiral in from an orbit', {}, 'spiral'],
  ];
  const UI_PRESETS = [
    ['single', 'Floating card', 'One screen of Hearth floating in 3D, glass edge and soft shadow', { layout: 'single', frame: 'glass' }, 'card panel screen'],
    ['laptop', 'Laptop', 'Hearth on a laptop whose lid opens', { layout: 'single', frame: 'laptop', tilt: 0.6 }, 'device macbook computer'],
    ['phone', 'Phone', 'Hearth on a phone', { layout: 'single', frame: 'phone' }, 'device mobile iphone'],
    ['browser', 'Browser window', 'Hearth in a window with its title bar', { layout: 'single', frame: 'browser' }, 'window chrome app'],
    ['tablet', 'Tablet', 'Hearth on a tablet', { layout: 'single', frame: 'tablet' }, 'device ipad'],
    ['glass', 'Glass panels', 'Rounded frosted panels stacked with depth', { layout: 'stack', frame: 'glass', count: 3 }, 'frosted glassmorphism'],
    ['stack', 'Stack', 'Three screens stacked diagonally with depth', { layout: 'stack', frame: 'browser', count: 3 }, 'layers'],
    ['parallax', 'Parallax depth', 'Five screens at different depths drifting past (parallax)', { layout: 'parallax', frame: 'glass', count: 5 }, 'depth drift'],
    ['explode', 'Explode into layers', 'One screen comes apart into its layers: background, panels, content, highlights', { layout: 'explode', frame: 'glass' }, 'exploded view breakdown'],
    ['fly-in', 'Fly in', 'Screens fly in from the sides and fan out', { layout: 'fly-in', frame: 'browser', count: 3 }, 'enter'],
    ['carousel', 'Carousel', 'Screens turn on a carousel', { layout: 'carousel', frame: 'glass', count: 6 }, 'rotate ring'],
    ['wall', 'Screen wall', 'A tilted wall of screens', { layout: 'wall', frame: 'none', count: 9 }, 'grid mosaic'],
    ['hero', 'Hero tilt', 'One big screen rises from a steep tilt to face you', { layout: 'hero', frame: 'browser' }, 'isometric reveal'],
    ['zoom', 'Zoom into the screen', 'The camera pushes into a screen until it fills the frame', { layout: 'zoom', frame: 'browser' }, 'push transition'],
    ['fan', 'Fan', 'Screens fan out like a hand of cards', { layout: 'fan', frame: 'glass', count: 5 }, 'cards spread'],
    ['feed', 'Phone feed', 'Phones scrolling up like a social feed', { layout: 'feed', frame: 'phone', count: 6, tilt: 0.6 }, 'scroll social vertical'],
    ['split', 'Side by side', 'Two screens slide apart (Claude | Astra)', { layout: 'split', frame: 'browser', count: 2 }, 'compare duo'],
    ['turntable', 'Turntable', 'A phone turning on a turntable', { layout: 'turntable', frame: 'phone' }, 'spin 360 product'],
    ['elements', 'UI elements fly in', 'Hearth\'s pieces (chat bubbles, buttons, a slider, a node, swatches, a toast) fly in and float', { layout: 'elements', frame: 'none' }, 'bubbles chips widgets'],
  ];
  const CURSOR_PRESETS = [
    ['arrow', 'Cursor tour', 'A cursor glides along a path and clicks (ripples)', { style: 'arrow' }, 'mouse pointer click'],
    ['hand', 'Hand cursor', 'A pointing hand that taps along a path', { style: 'hand' }, 'tap touch'],
    ['dot', 'Touch dot', 'A glowing dot for phone taps', { style: 'dot', size: 0.06 }, 'tap mobile'],
  ];
  const CAMERA_PRESETS = [
    ['dolly-in', 'Dolly in', 'The camera moves in'], ['dolly-out', 'Dolly out', 'The camera pulls back'], ['push-in', 'Slow push (Ken Burns)', 'A slow, steady push'],
    ['orbit', 'Orbit', 'The camera circles the subject'], ['orbit-360', 'Orbit all the way', 'A full turn around'], ['arc', 'Arc in', 'Arcs round while moving in'],
    ['crane-up', 'Crane up', 'Rises and looks down'], ['crane-down', 'Crane down', 'Comes down to eye level'], ['truck-left', 'Truck left', 'Slides sideways to the left'],
    ['truck-right', 'Truck right', 'Slides sideways to the right'], ['tilt-up', 'Tilt up', 'Looks up onto the subject'], ['tilt-down', 'Tilt down', 'Looks down onto the subject'],
    ['whip-pan', 'Whip pan', 'A fast pan with motion blur that lands on the subject'], ['rack-focus', 'Rack focus', 'The focus pulls from the back to the front (depth of field)'],
    ['handheld', 'Handheld', 'A gentle hand-held wobble'], ['zoom-punch', 'Zoom punch', 'A quick punch-in with a kick of shake'], ['snap-zoom', 'Snap zoom', 'An instant crash zoom'],
    ['dutch-push', 'Dutch push', 'Pushes in while the horizon tilts'], ['vertigo', 'Vertigo (dolly zoom)', 'Pulls back while zooming in: the background stretches'],
    ['drift', 'Drift', 'Floats slowly'], ['reveal', 'Pull back reveal', 'Starts very close and pulls back to reveal'], ['shake-hit', 'Shake hit', 'A short burst of shake'], ['roll-in', 'Roll in', 'Rolls into level'],
  ].map(([id, name, desc]) => [id, name, `${desc} · moves the 3D layers, or the whole picture when there's no 3D layer under it`, { move: id, ...(id === 'handheld' || id === 'drift' || id === 'orbit-360' ? { length: 8 } : id === 'zoom-punch' || id === 'snap-zoom' || id === 'shake-hit' ? { length: 0.6, start: 1 } : id === 'whip-pan' ? { length: 0.9 } : {}) }, 'camera move shot']);
  const LOGO_PRESETS = [
    ['flame-line', 'Flame line draw', 'The Hearth flame draws itself as a line, fills and the name appears', { style: 'line draw', mark: 'flame' }, 'hearth stroke'],
    ['flame-extrude', 'Flame 3D spin', 'The Hearth flame in 3D gold, spinning in', { style: 'extrude', mark: 'flame' }, 'hearth 3d metal'],
    ['anvil-slam', 'Anvil slam', 'The Forgeheart anvil slams down in 3D with sparks', { style: 'slam', mark: 'anvil', word: 'FORGEHEART' }, 'forgeheart 3d impact'],
    ['flame-burst', 'Flame burst', 'The flame bursts out with light rays and a flash', { style: 'burst', mark: 'flame' }, 'hearth rays flash'],
    ['flame-glitch', 'Flame glitch', 'The flame glitches in with an RGB split', { style: 'glitch', mark: 'flame' }, 'hearth digital'],
    ['flame-particles', 'Flame from particles', 'Sparks fly together into the flame', { style: 'particles', mark: 'flame' }, 'hearth sparks converge'],
    ['flame-molten', 'Molten flame', 'The flame outline fills up with molten metal', { style: 'molten', mark: 'flame' }, 'hearth fill liquid'],
    ['anvil-stamp', 'Anvil stamp', 'The anvil stamps down', { style: 'stamp', mark: 'anvil', word: 'FORGEHEART' }, 'forgeheart'],
    ['anvil-extrude', 'Anvil 3D spin', 'The Forgeheart anvil in 3D, spinning in', { style: 'extrude', mark: 'anvil', word: 'FORGEHEART' }, 'forgeheart 3d'],
    ['both-line', 'Flame + anvil', 'Both marks draw themselves side by side', { style: 'line draw', mark: 'both', word: 'HEARTH × FORGEHEART' }, 'lockup duo'],
  ];
  const BRAND_PRESETS = [
    ['forge gradient', 'Forge gradient', 'A slowly turning gradient: night, violet, ember, gold', {}, 'background backdrop'],
    ['molten', 'Molten', 'Flowing molten metal', {}, 'lava background'], ['aurora', 'Gold aurora', 'Gold and ember aurora curtains', { c2: '#ffd75e', c3: '#bd8bff' }, 'background sky'],
    ['glow orb', 'Glow orb', 'A breathing ember glow on night', {}, 'background soft'], ['grid', 'Neon grid floor', 'A Forgeheart neon grid rushing to the horizon', {}, 'synthwave background retro'],
    ['chrome', 'Chrome bands', 'Moving chrome bands', {}, 'metal background'], ['embers', 'Embers', 'Embers rising over everything', {}, 'sparks particles overlay'],
    ['grain', 'Film grain', 'Fine moving grain over everything', {}, 'noise texture overlay'], ['light sweep', 'Light sweep', 'A glint sweeping across every few seconds', {}, 'sheen glint overlay'],
    ['vignette', 'Vignette', 'Darker edges', {}, 'overlay'], ['spotlight', 'Spotlight', 'A warm spotlight from above', {}, 'light overlay'],
    ['flare', 'Lens flare', 'A lens flare passing by', {}, 'light overlay'], ['bokeh', 'Bokeh glow', 'Soft out-of-focus lights', {}, 'overlay'],
  ];
  const END_PRESETS = [
    ['forge', 'End card: Try Hearth', 'Flame, the name in gold, a line and a "Try Hearth" button', { style: 'forge' }, 'cta outro'],
    ['molten', 'End card: Follow', 'Molten name, "Follow for more"', { style: 'molten', cta: 'Follow for more' }, 'cta outro'],
    ['light', 'End card: Link in bio', 'Light paper card, "Link in bio"', { style: 'light', cta: 'Link in bio' }, 'cta outro'],
    ['duo', 'End card: Claude × Astra', 'Claude × Astra marks, "Two AIs, one app"', { style: 'duo', line: 'Two AIs, one app', cta: 'Try Hearth' }, 'cta outro'],
    ['minimal', 'End card: Minimal', 'Just the name and the button', { style: 'minimal' }, 'cta outro'],
  ];

  const SPEC = {
    type: { what: 'kinetic type', title: 'Kinetic type', cat: 'Motion · Type', glyph: 'Aa', presets: TYPE_PRESETS, presetKey: 'preset',
      fields: [w('text', 'MADE WITH HEARTH', 'Words ( / = new line)', 'Text'), s('preset', TYPE_PRESETS.map((p) => p[0]), 'cascade', 'Animation', 'Text'), s('font', FONTS, 'Oxanium', 'Font', 'Text'),
        s('weight', ['900', '800', '700', '600', '400'], '800', 'Weight', 'Text'), s('case', ['UPPER', 'as typed', 'lower'], 'UPPER', 'Case', 'Text'), s('align', ['center', 'left', 'right'], 'center', 'Align', 'Text'),
        s('zone', ['safe', 'title', 'full'], 'safe', 'Fits in', 'Text'), n('size', 0.14, 0.02, 0.5, 'Size', 'Text', 0.005), n('y', 0.5, 0, 1, 'Height in the frame', 'Text', 0.01),
        n('tracking', 0.02, -0.1, 0.6, 'Letter spacing', 'Text', 0.005), n('leading', 1.12, 0.8, 2, 'Line spacing', 'Text', 0.01),
        s('fill', FILLS, 'solid', 'Fill', 'Look'), c('color', '#ffffff', 'Color', 'Look'), c('accent', '#ffd75e', 'Accent / glow', 'Look'), n('glow', 0.4, 0, 2, 'Glow', 'Look', 0.05),
        s('plate', ['none', 'pill', 'box', 'underline'], 'none', 'Behind the words', 'Look'), c('plateColor', '#000000', 'Plate color', 'Look'), n('plateAlpha', 0.6, 0, 1, 'Plate opacity', 'Look', 0.05),
        ...TIMING(), s('exit', ['fade up', 'fade', 'reverse', 'drop', 'blur', 'none'], 'fade up', 'Leaves by', 'Timing'), ...TIMED] },
    type3d: { what: '3D type', title: '3D type', cat: 'Motion · 3D type', glyph: '3D', presets: TYPE3D_PRESETS, presetKey: 'preset',
      fields: [w('text', 'HEARTH', 'Words', 'Text'), s('preset', TYPE3D_PRESETS.map((p) => p[0]), 'spin-in', 'Animation', 'Text'), s('font', FONTS, 'Oxanium', 'Font', 'Text'),
        s('color', ['gold', 'chrome', 'molten', '#ffffff'], 'gold', 'Face', 'Look'), c('side', '#ff8c42', 'Depth color', 'Look'), n('depth', 0.5, 0.05, 1.5, 'Depth', 'Look', 0.05),
        n('size', 1, 0.3, 2, 'Size', 'Text', 0.05), n('y', 0.5, 0, 1, 'Height in the frame', 'Text', 0.01), n('float', 0.5, 0, 2, 'Float', 'Motion', 0.05),
        ...TIMING({ speed: 0.9, stagger: 0.08 }), ...TIMED.map((f) => (f.name === 'timing' ? { ...f, value: 'seconds' } : f)), b('follow', true, 'Follows the camera layer', 'Camera'), n('dof', 0, 0, 2, 'Depth of field', 'Camera', 0.05), n('focus', 0, -10, 10, 'Focus depth', 'Camera', 0.1)] },
    ui: { what: 'Hearth UI', title: 'Hearth on screen', cat: 'Motion · Hearth UI', glyph: '▣', presets: UI_PRESETS, presetKey: null,
      fields: [w('pics', '', 'Pictures (reference names or mock:chat, mock:lab…)', 'Screens', true), s('layout', Object.keys({ single: 1, stack: 1, parallax: 1, explode: 1, 'fly-in': 1, carousel: 1, wall: 1, hero: 1, zoom: 1, fan: 1, feed: 1, split: 1, turntable: 1, elements: 1 }), 'single', 'Layout', 'Screens'),
        s('frame', ['glass', 'browser', 'laptop', 'phone', 'tablet', 'none'], 'glass', 'Frame', 'Screens'), n('count', 3, 1, 12, 'Screens', 'Screens', 1),
        n('size', 1, 0.3, 2, 'Size', 'Screens', 0.05), n('tilt', 1, -2, 2, 'Tilt', 'Screens', 0.05), n('spread', 1, 0.2, 2.5, 'Spread', 'Screens', 0.05), n('depth', 1, 0, 3, 'Depth between', 'Screens', 0.05),
        n('drift', 1, 0, 3, 'Drift', 'Motion', 0.05), n('float', 1, 0, 3, 'Float', 'Motion', 0.05), s('ease', EASES, 'back', 'Easing', 'Motion'),
        n('radius', 1, 0, 3, 'Corner radius', 'Look', 0.05), n('thickness', 0.06, 0, 0.4, 'Thickness', 'Look', 0.01), n('shadow', 1, 0, 2, 'Shadow', 'Look', 0.05),
        ...TIMING({ speed: 1.1, stagger: 0.18, hold: 3 }), b('follow', true, 'Follows the camera layer', 'Camera'), n('dof', 0, 0, 2, 'Depth of field', 'Camera', 0.05), n('focus', 0, -10, 10, 'Focus depth', 'Camera', 0.1)],
      optsOf: (v) => { const p = String(v('pics') || '').split(',').map((x) => x.trim()).filter(Boolean); return p.length ? { pics: p } : null; } },
    cursor: { what: 'cursor', title: 'Cursor', cat: 'Motion · Cursor', glyph: '↖', presets: CURSOR_PRESETS, presetKey: null,
      fields: [w('path', '', 'Path (x,y[,click]; … in 0..1)', 'Path', true), s('style', ['arrow', 'hand', 'dot'], 'arrow', 'Cursor', 'Look'), n('size', 0.05, 0.01, 0.2, 'Size', 'Look', 0.005), c('color', '#ffffff', 'Color', 'Look'), c('accent', '#ffd75e', 'Click color', 'Look'),
        n('trail', 0.5, 0, 2, 'Trail', 'Look', 0.05), n('arc', 1, -2, 2, 'Curve of the moves', 'Motion', 0.05), n('start', 0.3, 0, 30, 'Starts at (s)', 'Timing', 0.05), n('speed', 0.9, 0.15, 4, 'Each move takes (s)', 'Timing', 0.05), n('pause', 0.35, 0, 3, 'Pause at each point (s)', 'Timing', 0.05)],
      optsOf: (v) => { const p = parseCursorPath(v('path')); return p ? { path: p } : null; } },
    camera: { what: 'camera move', title: 'Camera move', cat: 'Motion · Camera', glyph: '◎', presets: CAMERA_PRESETS, presetKey: 'move',
      fields: [s('move', CAMERA_PRESETS.map((p) => p[0]), 'dolly-in', 'Move', 'Move'), s('mode', ['auto', '3D stage', 'whole picture', 'both'], 'auto', 'Moves', 'Move'), n('amount', 1, -3, 3, 'Amount', 'Move', 0.05),
        n('start', 0, 0, 60, 'Starts at (s)', 'Timing', 0.05), n('length', 3, 0.05, 30, 'Takes (s)', 'Timing', 0.05), n('hold', 1.5, 0, 20, 'Holds (s)', 'Timing', 0.1), s('ease', ['auto', ...EASES], 'auto', 'Easing', 'Timing'),
        n('panX', 0, -5, 5, 'Pan X', 'Keyframe me', 0.01), n('panY', 0, -5, 5, 'Pan Y', 'Keyframe me', 0.01), n('push', 0, -1, 0.9, 'Push in', 'Keyframe me', 0.01), n('zoom', 1, 0.3, 3, 'Zoom', 'Keyframe me', 0.01), n('roll', 0, -45, 45, 'Roll °', 'Keyframe me', 0.5),
        n('handheld', 0, 0, 2, 'Handheld on top', 'Keyframe me', 0.05), n('blur', 1, 0, 3, 'Motion blur', 'Look', 0.05)] },
    logo: { what: 'logo reveal', title: 'Logo reveal', cat: 'Motion · Logo', glyph: '✦', presets: LOGO_PRESETS, presetKey: null,
      fields: [s('style', ['line draw', 'extrude', 'slam', 'burst', 'glitch', 'particles', 'molten', 'stamp'], 'line draw', 'Reveal', 'Logo'), s('mark', ['flame', 'anvil', 'both', 'astra'], 'flame', 'Mark', 'Logo'),
        w('word', 'HEARTH', 'Name', 'Logo'), w('tagline', '', 'Line under it', 'Logo'), c('color', '#ffd75e', 'Color', 'Look'), c('accent', '#ff8c42', 'Accent', 'Look'), s('fill', ['gold', 'solid', 'gradient', 'molten', 'chrome'], 'gold', 'Name fill', 'Look'),
        n('glow', 1, 0, 3, 'Glow', 'Look', 0.05), n('depth', 0.5, 0.05, 1.5, '3D depth', 'Look', 0.05), n('size', 0.42, 0.1, 1, 'Size', 'Logo', 0.01), n('y', 0.42, 0, 1, 'Height in the frame', 'Logo', 0.01),
        n('start', 0.2, 0, 30, 'Starts at (s)', 'Timing', 0.05), n('speed', 1.6, 0.1, 6, 'Takes (s)', 'Timing', 0.05), n('hold', 2.5, 0, 20, 'Holds (s)', 'Timing', 0.1), n('out', 0, 0, 60, 'Leaves at (s, 0 = stays)', 'Timing', 0.1),
        b('follow', true, 'Follows the camera layer (3D)', 'Camera')] },
    brand: { what: 'brand look', title: 'Brand look', cat: 'Motion · Brand', glyph: '▦', presets: BRAND_PRESETS, presetKey: 'style',
      fields: [s('style', BRAND_PRESETS.map((p) => p[0]), 'forge gradient', 'Look', 'Brand'), c('c1', '#140a24', 'Color 1 (dark)', 'Brand'), c('c2', '#ff8c42', 'Color 2', 'Brand'), c('c3', '#ffd75e', 'Color 3 (bright)', 'Brand'),
        n('amount', 1, 0, 3, 'Amount', 'Brand', 0.05), n('speed', 1, 0, 4, 'Speed', 'Motion', 0.05), n('every', 3, 0.5, 20, 'Every (s, sweeps / flares)', 'Motion', 0.1), b('backdrop', false, 'Dark backdrop under embers', 'Brand'),
        n('start', 0, 0, 60, 'Starts at (s)', 'Timing', 0.05), n('fadeIn', 0.6, 0, 5, 'Fades in (s)', 'Timing', 0.05)] },
    endcard: { what: 'end card', title: 'End card', cat: 'Motion · End card', glyph: '■', presets: END_PRESETS, presetKey: 'style',
      fields: [s('style', ['forge', 'light', 'molten', 'duo', 'minimal'], 'forge', 'Style', 'Card'), w('title', 'Hearth', 'Name', 'Card'), w('line', 'Claude and Astra, in one app', 'Line', 'Card'), w('cta', 'Try Hearth', 'Button', 'Card'), w('handle', '', 'Handle / link', 'Card'),
        c('accent', '#ffd75e', 'Button color', 'Look'), n('size', 1, 0.4, 1.8, 'Size', 'Look', 0.05), b('backdrop', true, 'Backdrop', 'Look'), n('start', 0.2, 0, 60, 'Starts at (s)', 'Timing', 0.05), n('hold', 3, 0, 20, 'Holds (s)', 'Timing', 0.1)] },
  };
  const KINDS = Object.keys(SPEC);
  function parseCursorPath(text) {
    const pts = String(text || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean).map((p) => { const a = p.split(/[,\s]+/); const x = Number(a[0]); const y = Number(a[1]); return Number.isFinite(x) && Number.isFinite(y) ? [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), /click|c|1/i.test(a[2] || '') ? 1 : 0] : null; }).filter(Boolean);
    return pts.length > 1 ? pts : null;
  }

  // ---------- node types (one per kind; the Nodes view shows a motion layer as its node) ----------
  let nodesReady = false;
  function ensureNodes() {
    if (nodesReady) return true;
    if (typeof ThreeNodes === 'undefined' || !ThreeNodes.registry) return false;
    const reg = ThreeNodes.registry;
    for (const kind of KINDS) {
      const S = SPEC[kind];
      if (reg.has(`motion-${kind}`)) continue;
      const inputs = S.fields.filter((f) => !f.widget).map((f) => ({ ...f, slider: true }));
      const widgets = S.fields.filter((f) => f.widget).map((f) => ({ ...f }));
      reg.define({ type: `motion-${kind}`, title: S.title, category: 'Motion design', color: '#ffb347', idBase: kind === 'type3d' ? 'type3d' : kind, desc: `${S.title}: makes this layer a ${S.what} layer (Hearth's motion-design kit). Its knobs are the layer's sliders; wire Time, LFO or Keys nodes into them.`,
        keywords: `motion design ${kind} ${S.what} kinetic typography ui camera logo brand end card`, inputs, widgets, outputs: [],
        compile: (cx) => {
          if (cx.shared.filter || cx.shared.layerCall) { cx.warn('One whole-layer node per layer: this one is ignored (add another layer)'); return {}; }
          const params = S.fields.filter((f) => !f.opt).map((f) => ({ key: f.name, expr: cx.in(f.name) }));
          const opts = S.optsOf ? S.optsOf((k) => cx.value(k)) : null;
          cx.shared.layerCall = { fn: `motion.${kind}`, what: S.what, params, opts: opts ? JSON.stringify(opts) : '' };
          return {};
        } });
    }
    nodesReady = true;
    return true;
  }
  // a layer's code: a graph with one motion node (compiled by the Lab's node compiler, the graph kept in its last line)
  function codeFor(kind, values = {}) {
    const S = SPEC[kind];
    if (!S) throw new Error(`No motion kind "${kind}" (${KINDS.join(', ')})`);
    const vals = Object.fromEntries(Object.entries(values).filter(([k]) => S.fields.some((f) => f.name === k)));
    if (ensureNodes() && typeof NodeView !== 'undefined') {
      try {
        const g = NodeView.emptyGraph('three');
        g.nodes.push({ id: S.title ? (kind === 'type3d' ? 'type3d1' : `${kind}1`) : 'm1', type: `motion-${kind}`, x: 0, y: 0, values: vals });
        const graph = NodeView.normalize(g, ThreeNodes.registry);
        graph.meta = { motion: kind };
        const r = ThreeNodes.compile(graph);
        if (!r.errors?.length && /motion\./.test(r.code)) return r.code;
      } catch (err) { console.warn('motion nodes', err); }
    }
    return plainCode(kind, vals);
  }
  // the same layer without the node compiler (plain tweak() sliders + the words as values)
  function plainCode(kind, vals = {}) {
    const S = SPEC[kind];
    const v = (f) => (f.name in vals ? vals[f.name] : f.value);
    const sl = S.fields.filter((f) => f.kind !== 'text');
    const lines = sl.map((f) => `  ${f.name}: { value: ${q(v(f))}${f.options ? `, options: ${q(f.options)}` : ''}${f.min != null ? `, min: ${f.min}, max: ${f.max}` : ''}${f.step ? `, step: ${f.step}` : ''}, label: ${q(f.label)}, group: ${q(f.group)} },`);
    const words = S.fields.filter((f) => f.kind === 'text' && !f.opt).map((f) => `M.${f.name} = ${q(String(v(f)))};`);
    const opts = S.optsOf ? S.optsOf((k) => (k in vals ? vals[k] : S.fields.find((f) => f.name === k)?.value)) : null;
    return `// A ${S.what} layer (Hearth's motion-design kit): its settings are the sliders.\nconst M = tweak({\n${lines.join('\n')}\n});\n${words.join('\n')}${words.length ? '\n' : ''}motion.${kind}(M${opts ? `, ${JSON.stringify(opts)}` : ''});\n`;
  }

  // ---------- the templates (ThreeLayers.TEMPLATES, pack 'motion') ----------
  // layer settings a template asks for: overlays blend, backdrops go to the bottom, cameras on top
  const PROPS = { grain: { blend: 'overlay' }, 'light sweep': { blend: 'add' }, embers: { blend: 'add' }, flare: { blend: 'add' }, bokeh: { blend: 'screen' }, spotlight: { blend: 'add' } };
  const BACKDROPS = new Set(['forge gradient', 'molten', 'aurora', 'glow orb', 'grid', 'chrome']);
  const TEMPLATES = [];
  for (const kind of KINDS) {
    const S = SPEC[kind];
    for (const [id, name, desc, values = {}, tags = ''] of S.presets) {
      const vals = { ...values };
      if (S.presetKey && !(S.presetKey in vals)) vals[S.presetKey] = id;
      const t = { id: `mo-${kind}-${id.replace(/\s+/g, '-')}`, name: kind === 'type' ? `Type: ${name}` : kind === 'type3d' ? `3D type: ${name}` : kind === 'camera' ? `Camera: ${name}` : name, cat: S.cat, desc, tags: `motion design ${S.what} ${tags}`, pack: 'motion',
        motion: { kind, preset: id, values: vals, props: kind === 'brand' ? PROPS[id] || {} : {}, bottom: kind === 'brand' && BACKDROPS.has(id), top: kind === 'camera' } };
      let code = null;
      Object.defineProperty(t, 'code', { enumerable: true, get: () => (code ||= codeFor(kind, vals)) });
      TEMPLATES.push(t);
    }
  }
  if (typeof ThreeLayers !== 'undefined') ThreeLayers.TEMPLATES.push(...TEMPLATES);
  const byId = (id) => TEMPLATES.find((t) => t.id === id) || null;
  // "cascade", "Type: Cascade", "laptop", "dolly in", "flame line" → a template
  function find(text, kind = null) {
    const qq = norm(text).replace(/^(type|3d type|camera|motion)\s*[:·-]?\s*/, (m) => (kind ? '' : m));
    if (!qq) return null;
    const list = TEMPLATES.filter((t) => !kind || t.motion.kind === kind);
    const key = (t) => [norm(t.name), norm(t.motion.preset), norm(t.id), norm(t.name.replace(/^(Type|Camera):\s*/, ''))];
    return list.find((t) => key(t).includes(qq)) || list.find((t) => key(t).some((k) => k.startsWith(qq))) || list.find((t) => `${norm(t.name)} ${norm(t.desc)} ${norm(t.tags)}`.includes(qq)) || null;
  }

  // ---------- adding to the Lab ----------
  async function lab() {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t available');
    if (!ThreeLab.director) { ThreeLab.act?.('noop'); for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100); }
    if (!ThreeLab.director) throw new Error('The Three.js Lab is not ready yet');
    return ThreeLab.director;
  }
  // The Oxanium font in the preview page (the sequence sends it too; without it the type falls back to bold system fonts)
  let fontB64 = null;
  async function ensureFont(d) {
    try {
      const has = await d.evalInSketch('return document.fonts.check("12px Oxanium")');
      if (has?.ok && has.value) return;
      if (!fontB64) { const u8 = await window.hub.fs.read(`${appDir()}/assets/oxanium.ttf`, { encoding: 'buffer' }); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)); fontB64 = btoa(bin); }
      await d.evalInSketch(`const f = new FontFace('Oxanium', 'url(data:font/ttf;base64,${fontB64})'); return f.load().then((x) => { document.fonts.add(x); return true; })`);
    } catch { /* the fallback fonts */ }
  }
  const appDir = () => { try { return decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, ''); } catch { return '.'; } };
  // the code of a template with some knobs set (words, pictures, a preset…)
  function codeOf(t, over = {}) { return Object.keys(over).length ? codeFor(t.motion.kind, { ...t.motion.values, ...over }) : t.code; }
  // add a motion layer: { template | kind + values }, name, over (knob values), props (layer settings), position
  async function add(what, { over = {}, name = null, props = {}, position = null, wait = 1, select = true } = {}) {
    const t = typeof what === 'string' ? byId(what) || find(what) : what;
    if (!t?.motion) throw new Error(`No motion preset "${what}" (/motion-kit lists them)`);
    const d = await lab();
    const code = codeOf(t, over);
    const ls = d.layers().layers;
    const pos = position ?? (t.motion.bottom ? 'bottom' : null);
    const r = await d.addLayer({ name: name || `${MARK}${t.name.replace(/^(Type|Camera):\s*/, '')}`, code, position: pos ?? undefined, props: { ...t.motion.props, ...props } }, wait);
    if (!select) { /* the director's calls keep the selection the Lab gives them */ }
    ensureFont(d);
    (typeof Usage !== 'undefined') && Usage.track?.(`Lab Motion › ${t.name}`);
    return { added: r.added, layers: ls.length + 1 };
  }
  // the selected layer's motion kind and values (from its node graph), or null
  function motionOf(code) {
    if (typeof NodeView === 'undefined') return null;
    const hit = NodeView.extract(String(code || ''));
    const node = hit?.graph?.nodes?.find((x) => /^motion-/.test(x.type));
    return node ? { kind: node.type.slice(7), values: node.values || {}, graph: hit.graph, node } : null;
  }
  // change knobs of a motion layer (its words, pictures…) by rebuilding its code from its graph
  async function setValues(layerRef, over) {
    const d = await lab();
    const L = layerRef ? d.layers().layers.find((x) => x.id === layerRef || x.name === layerRef || norm(x.name).includes(norm(layerRef))) : d.layers().layers.find((x) => x.selected);
    if (!L) throw new Error('Select a motion layer first (or name it)');
    const code = ThreeLab.scenes?.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId()))?.find((x) => x.id === L.id)?.code;
    const m = motionOf(code);
    if (!m) throw new Error(`"${L.name}" isn't a motion layer`);
    const next = codeFor(m.kind, { ...m.values, ...over });
    await d.updateLayer(L.id, { code: next }, 0.6);
    return { layer: L.name, kind: m.kind };
  }

  // ---------- Put Hearth on screen ----------
  // Pictures of Hearth: the newest capture shots (◉ Capture), else a fresh screenshot of the window; Hearth drawn
  // (mock:chat, mock:lab…) fills the rest. They become the sketch's references (refTexture), never the owner's files.
  async function hearthPictures({ fresh = true, max = 3 } = {}) {
    const out = [];
    if (typeof Capture === 'undefined') return out;
    let shots = (Capture.recent?.() || []).filter((x) => x.kind === 'shot' && x.path).slice(0, max).map((x) => x.path);
    if (!shots.length && fresh) { try { const s = await Capture.shot({ target: 'window', quiet: true }); if (s?.path) shots = [s.path]; } catch { /* mocks only */ } }
    for (const [i, p] of shots.entries()) {
      try { const r = await (await lab()).refs.add(p, `hearth-${i + 1}`); if (r?.key) out.push(r.key); } catch { /* skip that one */ }
    }
    return out;
  }
  // A whole shot: backdrop, Hearth's screens (captures + drawn), a cursor clicking, a title, a camera move.
  // here: in the scene on screen (the director's scene), else a new sketch "Hearth on screen" (nothing of yours changes)
  async function hearthOnScreen({ layout = null, frame = null, words = null, here = false, fresh = true, size = null } = {}) {
    await lab();
    const L = ThreeLab;
    if (!here) {
      const name = uniqueSketchName('Hearth on screen');
      L.scenes.create({ name, code: codeFor('brand', { style: 'forge gradient' }), open: true, frame: size || L.scenes.frameOf?.(L.scenes.currentId()) || null });
      for (let i = 0; i < 60 && L.director?.layers().sketch !== name; i++) await sleep(100);
      await sleep(400);
      const d0 = await lab();
      const first = d0.layers().layers[0];
      if (first) await d0.updateLayer(first.id, { name: `${MARK}Forge gradient` }, 0.3);
    }
    const refs = await hearthPictures({ fresh });
    const pics = [...refs, 'mock:chat', 'mock:lab', 'mock:board', 'mock:editor', 'mock:nodes'].slice(0, 5);
    const lay = layout || 'stack';
    const fr = frame || (lay === 'feed' || lay === 'turntable' ? 'phone' : 'browser');
    const added = [];
    if (here) added.push((await add('mo-brand-forge-gradient', { position: 'bottom' })).added);
    added.push((await add('mo-ui-stack', { over: { layout: lay, frame: fr, pics: pics.join(', '), count: lay === 'single' || lay === 'hero' || lay === 'zoom' ? 1 : 3 }, name: `${MARK}Hearth on screen` })).added);
    added.push((await add('mo-cursor-arrow', { over: { start: 1.6 } })).added);
    added.push((await add('mo-type-rise', { over: { text: words || 'ONE WINDOW / FOR ALL YOUR AIs', y: 0.08, size: 0.09, start: 0.6 } })).added);
    added.push((await add('mo-camera-dolly-in', { over: { length: 4, amount: 0.6 } })).added);
    return { layers: added, pictures: refs.length ? refs : ['(drawn Hearth screens: no capture yet)'], sketch: L.director?.layers().sketch };
  }
  function uniqueSketchName(base) {
    const all = new Set((ThreeLab.scenes?.all() || []).map((x) => x.name));
    if (!all.has(base)) return base;
    for (let i = 2; i < 99; i++) if (!all.has(`${base} ${i}`)) return `${base} ${i}`;
    return `${base} ${Date.now()}`;
  }

  // ---------- the Lab sequence: motion layers as overlays over a range, a motion sketch as a scene clip ----------
  async function toSequence(what, { over = {}, at = null, secs = null } = {}) {
    if (typeof ThreeSeq === 'undefined') throw new Error('The Lab sequence isn\'t available');
    const t = typeof what === 'string' ? byId(what) || find(what) : what;
    if (!t?.motion) throw new Error(`No motion preset "${what}"`);
    if (!ThreeSeq.active) await ThreeSeq.enter?.();
    const id = await ThreeSeq.add({ overlay: { name: `${MARK}${t.name.replace(/^(Type|Camera):\s*/, '')}`, code: codeOf(t, over), blend: t.motion.props?.blend || 'normal' } }, { at: at ?? ThreeSeq.time, dur: secs || (t.motion.kind === 'camera' ? 4 : 3.5) });
    return { overlay: t.name, at: at ?? ThreeSeq.time, id };
  }

  // ---------- the picker: a Motion tab in the effects picker (X), Alt+X ----------
  const ACTIONS = [
    { id: 'act-hearth', name: 'Put Hearth on screen', cat: 'Start here', desc: 'A whole shot in a new sketch: Hearth\'s screens (your newest captures, or Hearth drawn) in 3D, a cursor clicking, a title and a camera move', run: () => hearthOnScreen() },
    { id: 'act-intro', name: 'A motion intro (sequence)', cat: 'Start here', desc: 'A short 9:16 sequence: logo reveal → Hearth on screen with kinetic type → end card, ready to render', run: () => sampleSequence() },
    { id: 'act-shots', name: 'Shot list: camera moves', cat: 'Start here', desc: 'Every camera move (dolly, orbit, crane, whip pan, rack focus, handheld, zoom punch…)', run: () => { setTimeout(() => openPicker('camera'), 60); return 'Shot list'; } },
  ];
  const FAMILY_ORDER = ['Start here', 'Motion · Hearth UI', 'Motion · Type', 'Motion · Camera', 'Motion · Logo', 'Motion · Brand', 'Motion · End card', 'Motion · 3D type', 'Motion · Cursor'];
  function pickerItems() {
    const out = ACTIONS.map((a) => ({ kind: 'motion', id: a.id, name: a.name, cat: a.cat, desc: a.desc, tags: 'start whole shot', action: a }));
    for (const t of TEMPLATES) out.push({ kind: 'motion', id: t.id, name: t.name, cat: t.cat, desc: t.desc, tags: t.tags, tpl: t });
    return out.sort((x, y) => FAMILY_ORDER.indexOf(x.cat) - FAMILY_ORDER.indexOf(y.cat));
  }
  async function applyItem(it, { alt = false } = {}) {
    if (it.action) { const r = await it.action.run(); const text = typeof r === 'string' ? r : `${it.name}: ${(r?.layers || []).length} layers`; toast(text, { timeout: 2600 }); return text; }
    if (alt && typeof ThreeSeq !== 'undefined' && ThreeSeq.active) { const r = await toSequence(it.tpl); const text = `${it.name} over the sequence at ${r.at.toFixed(2)} s`; toast(text, { timeout: 2400 }); return text; }
    const r = await add(it.tpl, alt ? { position: (await lab()).layers().layers.findIndex((L) => L.selected) + 2 } : {});
    const text = `Added "${r.added}" (its knobs are in Sliders; Alt+N shows it as nodes)`;
    toast(text, { timeout: 2400 });
    return text;
  }
  const THUMB_BG = { 'Motion · Type': ['#1b0f3b', '#ffd75e'], 'Motion · 3D type': ['#2a1208', '#ffd75e'], 'Motion · Hearth UI': ['#0d0f15', '#48ddff'], 'Motion · Cursor': ['#14161d', '#ffffff'], 'Motion · Camera': ['#101522', '#bd8bff'], 'Motion · Logo': ['#1c0f26', '#ff8c42'], 'Motion · Brand': ['#140a24', '#ff8c42'], 'Motion · End card': ['#0b0b12', '#ffd75e'], 'Start here': ['#2a1208', '#ffd75e'] };
  function thumb(it) {
    const [a, z] = THUMB_BG[it.cat] || ['#111', '#ffd75e'];
    const box = el('span', { class: 'fx-thumb mo-thumb' });
    box.style.background = `linear-gradient(135deg, ${a} 0%, ${a} 45%, ${z} 160%)`;
    const glyph = it.action ? '▶' : SPEC[it.tpl?.motion.kind]?.glyph || '◭';
    const g = el('b', { text: glyph }); g.style.color = z; box.append(g);
    return box;
  }
  function hint(it) { return it.action ? 'Enter: make it' : (typeof ThreeSeq !== 'undefined' && ThreeSeq.active ? 'Enter: add as a layer · Shift+Enter: over the sequence at the playhead' : 'Enter: add on top · Shift+Enter: above the selected layer'); }
  function openPicker(query = '') {
    if (typeof ThreeFX === 'undefined') throw new Error('The effects picker isn\'t loaded');
    ThreeLab.act?.('noop');
    return ThreeFX.openPicker('motion', { query });
  }
  if (typeof ThreeFX !== 'undefined' && ThreeFX.extend) ThreeFX.extend({ kind: 'motion', label: 'Motion', tab: ['motion', 'Motion', 'Motion design: Hearth on screen, kinetic type, camera moves, logos, end cards'], items: pickerItems, apply: applyItem, thumb, hint });

  // ---------- a sample motion intro, as a Lab sequence (logo → Hearth on screen → end card) ----------
  async function sampleSequence({ format = '9:16', words = null } = {}) {
    await lab();
    const L = ThreeLab;
    const mk = (name, layers) => L.scenes.create({ name: uniqueSketchName(name), layers: layers.map((x, i) => ThreeLayers.defaults({ name: x[0], code: x[1], slot: i, color: ThreeLayers.COLORS[i % ThreeLayers.COLORS.length], ...(x[2] || {}) })), code: layers[0][1], frame: format });
    const pics = 'mock:chat, mock:lab, mock:board';
    const s1 = mk('Motion · logo', [[`${MARK}Glow orb`, codeFor('brand', { style: 'glow orb' })], [`${MARK}Flame`, codeFor('logo', { style: 'line draw', speed: 1.2, tagline: 'Claude and Astra, in one app' })], [`${MARK}Grain`, codeFor('brand', { style: 'grain' }), { blend: 'overlay' }]]);
    const s2 = mk('Motion · on screen', [[`${MARK}Forge gradient`, codeFor('brand', { style: 'forge gradient' })], [`${MARK}Hearth on screen`, codeFor('ui', { layout: 'stack', frame: 'browser', pics, count: 3, start: 0.1 })], [`${MARK}Cursor`, codeFor('cursor', { start: 1.2 })], [`${MARK}Title`, codeFor('type', { preset: 'rise', text: words || 'ONE WINDOW / FOR ALL YOUR AIs', y: 0.06, size: 0.09, start: 0.3 })], [`${MARK}Camera`, codeFor('camera', { move: 'dolly-in', length: 3.5, amount: 0.6 })]]);
    const s3 = mk('Motion · end card', [[`${MARK}End card`, codeFor('endcard', { style: 'forge' })], [`${MARK}Embers`, codeFor('brand', { style: 'embers' }), { blend: 'add' }]]);
    await ThreeSeq.create('Motion intro', { empty: true, format, show: true });
    await ThreeSeq.add({ sketch: s1.id }, { dur: 3, trans: null });
    await ThreeSeq.add({ sketch: s2.id }, { dur: 4 });
    await ThreeSeq.add({ sketch: s3.id }, { dur: 3 });
    return { sequence: 'Motion intro', scenes: [s1.name, s2.name, s3.name], layers: [] };
  }

  // ---------- directors: three_do { cmd: "motion", op } ----------
  const HELP = 'ops: list {family: ui|type|type3d|camera|logo|brand|endcard|cursor} · add {preset, words, pics, layout, frame, values: {knob: v}, in, out} (a new layer) · hearth {layout, frame, words, here} (Put Hearth on screen) · words {layer, text} · set {layer, values} · seq {preset, words, at, secs} (over the Lab sequence) · intro (a sample sequence). Presets by name: "cascade", "laptop", "dolly in", "flame line"… Time-driven; words land on hit markers / beats when there\'s a song.';
  async function handle(args = {}, ctx = {}) {
    try {
      const op = norm(args.op || (args.preset ? 'add' : 'help'));
      const call = ctx.call || ((tool, a) => HubBridge.call(tool, a));
      if (op === 'help') return { ok: true, value: HELP };
      if (op === 'list') {
        const fam = norm(args.family || args.kind || '');
        const list = TEMPLATES.filter((t) => !fam || t.motion.kind === fam || norm(t.cat).includes(fam));
        return { ok: true, value: list.map((t) => `${t.motion.preset} (${t.motion.kind}): ${t.desc}`).join('\n') };
      }
      if (op === 'add' || op === 'seq') {
        const t = byId(args.preset) || find(args.preset || args.name || '', args.family || null);
        if (!t) return { ok: false, error: `No motion preset "${args.preset}" (op list)` };
        const over = { ...(args.values || {}) };
        const S = SPEC[t.motion.kind];
        const wordKey = S.fields.find((f) => f.kind === 'text' && !f.opt)?.name;
        if (args.words != null && wordKey) over[wordKey] = String(args.words);
        if (args.pics) over.pics = [].concat(args.pics).join(', ');
        for (const k of ['layout', 'frame', 'style', 'mark', 'move']) if (args[k] != null) over[k] = args[k];
        if (op === 'seq') return { ok: true, value: await toSequence(t, { over, at: args.at != null ? Number(args.at) : null, secs: args.secs != null ? Number(args.secs) : null }) };
        const props = { ...t.motion.props, ...(args.in != null ? { in: Number(args.in) } : {}), ...(args.out != null ? { out: Number(args.out) } : {}) };
        const r = await call('three_add_layer', { name: args.name || `${MARK}${t.name.replace(/^(Type|Camera):\s*/, '')}`, code: codeOf(t, over), position: t.motion.bottom ? 'bottom' : undefined, settings: props, wait: 1.5 });
        if (r?.ok === false) return r;
        return { ok: true, value: { added: t.name, kind: t.motion.kind, note: 'One node in the Nodes view; its knobs are sliders (three_sliders / keyframes). Change words with op words.', report: r?.value ?? r } };
      }
      if (op === 'hearth') return { ok: true, value: await hearthOnScreen({ layout: args.layout, frame: args.frame, words: args.words, here: args.here !== false, fresh: args.fresh !== false }) };
      if (op === 'words' || op === 'set') {
        const over = { ...(args.values || {}) };
        if (args.text != null || args.words != null) {
          const d = await lab();
          const L = args.layer ? d.layers().layers.find((x) => x.name === args.layer || x.id === args.layer || norm(x.name).includes(norm(args.layer))) : d.layers().layers.find((x) => x.selected);
          const code = L ? ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((x) => x.id === L.id)?.code : null;
          const m = motionOf(code);
          const key = m ? SPEC[m.kind]?.fields.find((f) => f.kind === 'text' && !f.opt)?.name : null;
          if (!key) return { ok: false, error: 'That layer has no words (a type, logo or end card layer)' };
          over[key] = String(args.text ?? args.words);
        }
        return { ok: true, value: await setValues(args.layer || null, over) };
      }
      if (op === 'intro') return { ok: true, value: await sampleSequence({ format: args.format || '9:16', words: args.words || null }) };
      return { ok: false, error: `Unknown op "${op}" (op: "help")` };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // ---------- keys (keys.js lists them; each also has a menu entry and a command) ----------
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.code !== 'KeyX') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.target.closest?.('.tool-dock, dialog')) return;
    if (!document.querySelector('.layers')?.offsetParent) return;
    e.preventDefault();
    try { openPicker(); } catch (err) { toast(err.message, { type: 'error' }); }
    (typeof Usage !== 'undefined') && Usage.key?.('Alt+X', 'Lab');
  });
  try { Keys.add({ area: 'Lab', keys: 'Alt+X', what: 'Motion design kit: Hearth on screen, kinetic type, camera moves, logos, end cards (the effects picker\'s Motion tab, /motion-kit)', when: () => Boolean(document.querySelector('.layers')?.offsetParent), run: () => openPicker() }); } catch { /* keys list optional */ }

  return { SPEC, KINDS, TEMPLATES, ACTIONS, find, byId, codeFor, plainCode, add, setValues, motionOf, hearthOnScreen, hearthPictures, toSequence, sampleSequence, handle, openPicker, ensureNodes, ensureFont, parseCursorPath, pickerItems, applyItem, HELP };
})();
ThreeMotion.ensureNodes();
