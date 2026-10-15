// Kinetic typography (round 25, type): the sliders, the animation names, the paths, the lyric looks and the layer
// presets of 🅰 type layers (the hub: tools/three-type.js; the runtime: tools/three-sandbox.html "kinetic type layers").
// A slider's key is what the runtime reads from P; a key missing from P comes from the layer's options, then from the
// runtime's defaults (TY_DEF), so presets only list what they change.
const TypeData = (() => {
  // in / out animations (the runtime's TY_ANIM has the motion of each)
  const ANIMS = {
    fade: 'fades in', typewriter: 'types on, one at a time', wave: 'rises in a wave', scatter: 'flies in from everywhere', glitch: 'glitches in (jumps, flickers, wrong letters)',
    'slide-up': 'slides up', 'slide-down': 'slides down', 'slide-left': 'slides in from the right', 'slide-right': 'slides in from the left', 'scale-pop': 'pops in with an overshoot',
    'blur-in': 'comes into focus', 'split-flap': 'flips through letters like a departures board', drop: 'drops and bounces', spin: 'spins in', flip: 'flips over (3D)',
    zoom: 'zooms down from big', elastic: 'snaps in on a spring', bounce: 'bounces in from above', scramble: 'decodes from random letters', tracking: 'letters gather from wide spacing',
    swing: 'swings in', stretch: 'stretches in', 'fly-in': 'flies at the camera (3D) / grows in', rise: 'rises from the baseline', neon: 'flickers on like neon', shatter: 'shatters (best as an out)',
    // (round 45, kinetictype)
    'slide-blur': 'slides in out of a blur', split: 'splits open from the middle', 'outline-draw': 'draws on as an outline, the fill floods in after', 'zoom-through': 'flies in from far away',
  };
  const ANIM_IDS = Object.keys(ANIMS);
  const EASES = ['out', 'smooth', 'linear', 'in', 'inOut', 'expo', 'expoInOut', 'back', 'elastic', 'bounce', 'sine'];
  const ORDERS = ['forward', 'reverse', 'center', 'edges', 'random'];
  const UNITS = ['glyph', 'word', 'line'];
  const PATHS = { line: 'a straight line (the lines of the text)', circle: 'around a circle', arc: 'along an arc (a banner)', wave: 'along a sine wave', spiral: 'along a spiral', custom: 'along your own points (opts.points)' };
  const LOOKS = { fades: 'centered lines, each fading in and out', karaoke: 'the line fills with color as it is sung (next line under it)', oneword: 'one word at a time, big', scroll: 'every line, scrolling, the sung one lit', type: 'each line types on as it is sung', lines: 'each line animates in and out with the in / out presets' };
  const MATERIALS = ['plain', 'chrome', 'gold', 'glass', 'toon', 'clay', 'matte', 'wireframe', 'holographic', 'xray', 'normals', 'palette'];
  const n = (value, min, max, label, group, step, hint) => ({ value, min, max, label, group, ...(step ? { step } : {}), ...(hint ? { hint } : {}) });
  const c = (value, label, group, hint) => ({ value, label, group, ...(hint ? { hint } : {}) });
  const o = (value, options, label, group, hint) => ({ value, options, label, group, ...(hint ? { hint } : {}) });
  const SLIDERS = {
    // Text
    size: n(0.12, 0.02, 0.6, 'Size', 'Text', 0.005, 'of the frame'), tracking: n(0, -0.1, 0.6, 'Letter spacing', 'Text', 0.005), leading: n(1.1, 0.6, 2.2, 'Line spacing', 'Text', 0.01),
    x: n(0, -1, 1, 'Left / right', 'Text', 0.01), y: n(0, -1, 1, 'Up / down', 'Text', 0.01), align: o('center', ['left', 'center', 'right'], 'Align', 'Text'),
    case: o('as typed', ['as typed', 'UPPER', 'lower'], 'Case', 'Text'), opacity: n(1, 0, 1, 'Opacity', 'Text', 0.01),
    // Look
    color: c('#ffffff', 'Color', 'Look'), color2: c('#ffd75e', 'Accent', 'Look', 'karaoke fill, bass color'), outline: n(0, 0, 0.15, 'Outline', 'Look', 0.005), outlineColor: c('#000000', 'Outline color', 'Look'),
    glow: n(0, 0, 2, 'Glow', 'Look', 0.01), glowColor: c('#ff8c42', 'Glow color', 'Look'), softness: n(0, 0, 1, 'Softness', 'Look', 0.01), fill: n(1, 0, 1, 'Fill', 'Look', 0.01, '0 = outline only'),
    // Animation
    inAnim: o('wave', ANIM_IDS, 'In', 'Animation'), outAnim: o('fade', ['none', ...ANIM_IDS], 'Out', 'Animation'), unit: o('glyph', UNITS, 'By', 'Animation'), order: o('forward', ORDERS, 'Order', 'Animation'),
    ease: o('out', EASES, 'Easing', 'Animation'), start: n(0.2, 0, 20, 'Starts at', 'Animation', 0.05, 's'), stagger: n(0.05, 0, 1, 'Stagger', 'Animation', 0.005, 's between units'),
    dur: n(0.6, 0.02, 4, 'Each takes', 'Animation', 0.01, 's'), hold: n(2.5, 0, 30, 'Hold', 'Animation', 0.1, 's before going out'), amount: n(1, 0, 3, 'Amount', 'Animation', 0.01), wobble: n(0, 0, 1, 'Float', 'Animation', 0.01, 'idle drift'),
    // Path
    path: o('line', Object.keys(PATHS), 'Path', 'Path'), pathSize: n(0.6, 0.1, 1.6, 'Path size', 'Path', 0.01), pathOffset: n(0, 0, 1, 'Along the path', 'Path', 0.001), pathSpin: n(0, -2, 2, 'Path spin', 'Path', 0.01, 'turns / 10 s'),
    // 3D
    depth: n(0.25, 0, 1.5, 'Depth', '3D', 0.01, 'em'), bevel: n(0.03, 0, 0.12, 'Bevel', '3D', 0.002, 'em'), material: o('plain', MATERIALS, 'Material', '3D'), spin: n(0, -2, 2, 'Spin', '3D', 0.01), tilt: n(0, -1, 1, 'Tilt', '3D', 0.01),
    // Music (0 until you want it)
    kickScale: n(0, 0, 1, 'Scale on kick', 'Music', 0.01), kickGlow: n(0, 0, 2, 'Glow on kick', 'Music', 0.01), kickJitter: n(0, 0, 1, 'Jitter on kick', 'Music', 0.01),
    bassColor: n(0, 0, 1, 'Color on bass', 'Music', 0.01, 'toward the accent'), beatBounce: n(0, 0, 1, 'Bounce on kick', 'Music', 0.01), letterReact: n(0, 0, 1, 'Per letter', 'Music', 0.01, '0 = all together'),
    // Lyrics
    look: o('fades', Object.keys(LOOKS), 'Lyric look', 'Lyrics'), lead: n(0, -1, 1, 'Sync nudge', 'Lyrics', 0.01, 's (+ later)'),
    // (round 45, kinetictype) moves with the music: a step (word / letter / line) on each hit instead of a seconds stagger
    kSync: o('off', ['off', 'beat', 'bar', 'kick', 'snare', 'seconds'], 'Moves on', 'Moves with the music', 'off = its own timing in seconds'),
    kEvery: n(1, 0, 8, 'Every', 'Moves with the music', 1, 'hits per step (0 = all together)'), kSecs: n(0.5, 0.04, 4, 'Seconds', 'Moves with the music', 0.01, 'between steps, when it moves on seconds'),
    kHold: n(4, 0, 64, 'Hold', 'Moves with the music', 1, 'hits before going out (0 = stays)'), kFlow: o('build', ['build', 'one at a time'], 'Flow', 'Moves with the music'),
    kFx: o('none', ['none', 'punch', 'bounce', 'wave', 'flicker', 'glow', 'shake', 'highlight'], 'On each hit', 'Moves with the music'), kDur: n(0.6, 0.05, 2, 'Each takes', 'Moves with the music', 0.01, 'of the time between hits'),
  };
  // every layer gets these; presets add theirs
  const BASE = ['size', 'tracking', 'x', 'y', 'color', 'color2', 'glow', 'glowColor', 'outline', 'inAnim', 'outAnim', 'unit', 'order', 'ease', 'start', 'stagger', 'dur', 'hold', 'amount', 'kickScale', 'kickGlow', 'kickJitter', 'bassColor'];
  const P3D = ['depth', 'bevel', 'material', 'spin', 'tilt'];
  const PPATH = ['path', 'pathSize', 'pathOffset', 'pathSpin'];
  const PLYR = ['look', 'lead', 'leading'];
  const PKIN = ['kSync', 'kEvery', 'kHold', 'kFlow', 'kFx', 'kDur']; // (round 45, kinetictype)
  // layer presets: { id, name, cat, desc, sliders, opts }
  const P = (id, name, cat, desc, sliders = {}, opts = {}) => ({ id, name, cat, desc, sliders, opts });
  const PRESETS = [
    P('title', 'Title', 'Titles', 'a clean title rising in a wave, fading out', { inAnim: 'wave', outAnim: 'fade' }),
    P('typewriter', 'Typewriter', 'Titles', 'typed on letter by letter', { inAnim: 'typewriter', stagger: 0.06, dur: 0.02, outAnim: 'fade' }, { font: 'Consolas, "Courier New", monospace' }),
    P('wave', 'Wave', 'Titles', 'letters rising in a wave that keeps floating', { inAnim: 'wave', wobble: 0.6, stagger: 0.04 }),
    P('scatter', 'Scatter', 'Titles', 'letters flying in from everywhere, out the same way', { inAnim: 'scatter', outAnim: 'scatter', dur: 1.1, stagger: 0.02, ease: 'expo' }),
    P('glitch', 'Glitch', 'Titles', 'glitching in and out, chromatic', { inAnim: 'glitch', outAnim: 'glitch', stagger: 0.03, glowColor: '#00e0ff', glow: 0.4 }),
    P('slide', 'Slide up', 'Titles', 'words sliding up, one after another', { inAnim: 'slide-up', outAnim: 'slide-up', unit: 'word', stagger: 0.12, ease: 'expo' }),
    P('pop', 'Scale pop', 'Titles', 'each letter pops in with an overshoot', { inAnim: 'scale-pop', outAnim: 'zoom', stagger: 0.035, dur: 0.45 }),
    P('blur', 'Blur in', 'Titles', 'coming into focus from the middle out', { inAnim: 'blur-in', outAnim: 'blur-in', order: 'center', stagger: 0.04, dur: 0.9 }),
    P('splitflap', 'Split-flap', 'Titles', 'a departures board flipping to the word', { inAnim: 'split-flap', stagger: 0.07, dur: 1.2, color: '#f4efe6' }, { font: 'Consolas, "Courier New", monospace', weight: 700 }),
    P('decode', 'Decode', 'Titles', 'random letters settling into the word', { inAnim: 'scramble', outAnim: 'scramble', stagger: 0.03, dur: 0.8, color: '#48ddff' }, { font: 'Consolas, "Courier New", monospace' }),
    P('neon', 'Neon sign', 'Looks', 'flickering on, glowing', { inAnim: 'neon', color: '#ffe6ff', glow: 1.2, glowColor: '#ff2bd6', stagger: 0.06, dur: 0.9 }),
    P('outline', 'Outline', 'Looks', 'outlined letters that fill in', { inAnim: 'tracking', fill: 0, outline: 0.04, outlineColor: '#ffffff', unit: 'line', dur: 1.3, ease: 'expo' }),
    P('drop', 'Drop', 'Titles', 'words dropping in and bouncing', { inAnim: 'drop', outAnim: 'shatter', unit: 'word', stagger: 0.18, dur: 0.9 }),
    P('stretch', 'Stretch', 'Titles', 'letters stretching in on a spring', { inAnim: 'stretch', stagger: 0.04, dur: 0.8 }),
    P('chrome3d', 'Chrome 3D', '3D', 'extruded chrome letters with a bevel, turning slowly', { inAnim: 'flip', material: 'chrome', depth: 0.35, bevel: 0.04, spin: 0.15, tilt: 0.2, stagger: 0.06, dur: 0.9 }, { mode: '3d' }),
    P('gold3d', 'Gold 3D', '3D', 'heavy gold letters falling into place', { inAnim: 'drop', material: 'gold', depth: 0.5, bevel: 0.05, tilt: 0.25, stagger: 0.07, dur: 1 }, { mode: '3d' }),
    P('glass3d', 'Glass 3D', '3D', 'glass letters flying at the camera', { inAnim: 'fly-in', material: 'glass', depth: 0.3, bevel: 0.05, tilt: 0.15, stagger: 0.05, dur: 1.1, ease: 'expo' }, { mode: '3d' }),
    P('toon3d', 'Toon 3D', '3D', 'chunky cartoon letters popping in', { inAnim: 'scale-pop', material: 'toon', color: '#ff8c42', depth: 0.45, bevel: 0.02, tilt: 0.25, stagger: 0.05 }, { mode: '3d' }),
    P('holo3d', 'Hologram 3D', '3D', 'iridescent see-through letters, glitching', { inAnim: 'glitch', material: 'holographic', color: '#48ddff', depth: 0.2, bevel: 0.02, spin: -0.1 }, { mode: '3d' }),
    P('circle', 'Circle badge', 'Paths', 'text around a circle, turning', { path: 'circle', pathSize: 0.7, pathSpin: 0.4, inAnim: 'fade', size: 0.08, tracking: 0.08 }, { text: 'HEARTH • MADE IN THE LAB • ' }),
    P('arc', 'Arc banner', 'Paths', 'text along an arc', { path: 'arc', pathSize: 0.9, inAnim: 'scale-pop', size: 0.1 }),
    P('waveline', 'Wave line', 'Paths', 'text riding a sine wave', { path: 'wave', pathSize: 0.5, pathSpin: 0.5, inAnim: 'slide-left', size: 0.09 }),
    P('spiral', 'Spiral', 'Paths', 'text winding into a spiral', { path: 'spiral', pathSize: 0.9, pathOffset: 0, pathSpin: 0.3, inAnim: 'fade', size: 0.06 }),
    P('kick', 'Kick title', 'Music', 'a title that punches and glows on every kick', { inAnim: 'scale-pop', kickScale: 0.5, kickGlow: 1, glow: 0.2 }),
    P('bass', 'Bass colors', 'Music', 'letters turning to the accent with the bass, each in its own time', { bassColor: 1, letterReact: 0.7, color2: '#ff2bd6' }),
    P('punk', 'Jitter punk', 'Music', 'shaking letters that jitter on the kick', { inAnim: 'glitch', kickJitter: 0.8, letterReact: 1, beatBounce: 0.4, color: '#f4efe6', glowColor: '#ff3b2f', glow: 0.3 }),
    P('karaoke', 'Lyrics: karaoke', 'Lyrics', 'the line fills with color as it is sung, the next one under it', { look: 'karaoke', color: '#ffffff', color2: '#ffd75e', size: 0.07, outline: 0.03 }, { lyrics: [] }),
    P('oneword', 'Lyrics: one word big', 'Lyrics', 'one huge word at a time, on the singing', { look: 'oneword', size: 0.22, inAnim: 'scale-pop', dur: 0.18, kickScale: 0.2 }, { lyrics: [] }),
    P('scroll', 'Lyrics: scrolling', 'Lyrics', 'all the lines scrolling up, the sung one lit', { look: 'scroll', size: 0.06, leading: 1.6 }, { lyrics: [] }),
    P('fades', 'Lyrics: centered fades', 'Lyrics', 'each line fading in and out in the middle', { look: 'fades', size: 0.075, inAnim: 'blur-in', outAnim: 'fade', unit: 'word', stagger: 0.08, dur: 0.5 }, { lyrics: [] }),
    P('typed', 'Lyrics: typed', 'Lyrics', 'each line types on as it is sung', { look: 'type', size: 0.065 }, { lyrics: [], font: 'Consolas, "Courier New", monospace' }),
    P('lyric3d', 'Lyrics: 3D words', 'Lyrics', 'chrome 3D lines swinging in and out', { look: 'lines', inAnim: 'flip', outAnim: 'shatter', unit: 'word', stagger: 0.08, material: 'chrome', depth: 0.3, size: 0.08 }, { lyrics: [], mode: '3d' }),
  ];
  const HELP = `🅰 Kinetic type: a type layer is a tweak() block + textLayer(P, opts) (crisp SDF text at any size, or 3D extruded letters with a bevel and a material).
opts: text ("line one\\nline two"), mode 2d | 3d, font (a family, "google:Family", or "ref:<reference key>" for an asset-library font), weight, points (custom path [[x, y]…] in -1..1), lyrics [[start, end, "line", [word starts]]…], seed.
Sliders (P): ${Object.entries(SLIDERS).map(([k, s]) => `${k}${s.options ? ` (${s.options.slice(0, 8).join('|')}${s.options.length > 8 ? '…' : ''})` : ''}`).join(' ')}.
In / out: ${ANIM_IDS.join(', ')} (out also none). By glyph | word | line, order forward | reverse | center | edges | random, easing ${EASES.join(', ')}.
Paths: ${Object.keys(PATHS).join(', ')}. 3D materials: ${MATERIALS.join(', ')}. Lyric looks: ${Object.entries(LOOKS).map(([k, v]) => `${k} (${v})`).join(' · ')}.
Moves with the music (kSync beat|bar|kick|snare|seconds): a step (by glyph / word / line) on each hit, kEvery hits apart, kHold hits then out and again, kFlow build | one at a time, kFx on each hit (punch, bounce, wave, flicker, glow, shake, highlight), kDur = an entrance as a share of the time between hits; 22 presets: three_do type kinetic {preset, text, sync}.
Lyrics: paste them, or an .lrc / .srt; untimed lines are put on the song (the music analysis' onsets and beats), words too; /lyrics tap corrects them by tapping Space at each line.
Chat: /text [preset | text <words> | 3d <words> | in <anim> | out <anim> | by glyph|word|line | path <kind> | font <family> | material <kind> | set <slider> <value> | react kick|bass|off | particles | list | info] · /lyrics [paste | load <file> | look <look> | align | tap | shift <s> | export lrc|srt | sequence].
Director: three_do { cmd: "type", op } — list · add {preset, text, mode, font, sliders} · set {layer, values} · anim {layer, in, out, unit, order, ease, stagger, dur} · path {layer, kind, size} · text {layer, text} · lyrics {layer?, text (pasted / .lrc / .srt content) | file, look} (aligned to the song) · align {layer} · shift {layer, by} · react {layer, kick, bass, jitter} · info {layer}.`;
  return { ANIMS, ANIM_IDS, EASES, ORDERS, UNITS, PATHS, LOOKS, MATERIALS, SLIDERS, BASE, P3D, PPATH, PLYR, PKIN, PRESETS, HELP };
})();
window.TypeData = TypeData;
