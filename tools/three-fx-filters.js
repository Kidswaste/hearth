// The FX pack's filter layers: templates whose code calls filter(type, P) (the shaders are FILTER_DEFS in
// three-sandbox.html). They're added to ThreeLayers.FILTERS, so the Layers "＋" picker, /fx and the Three
// Director all see them. Every P key becomes a slider; "Reacts to" + "Music amount" pick what drives them.
(() => {
  const DRIVES = ['kick', 'snare', 'bass', 'level', 'beat', 'hit', 'hats', 'drop', 'off'];
  // spec helpers: number, color, on/off, choice
  const n = (value, min, max, label, step) => ({ value, min, max, label, ...(step ? { step } : {}) });
  const c = (value, label) => ({ value, label });
  const b = (value, label) => ({ value, label });
  const o = (value, options, label) => ({ value, options, label });
  const M = (drive = 'kick', react = 0.5) => ({
    drive: { value: drive, options: DRIVES, label: 'Reacts to', group: 'Music', hint: 'Which hit or level moves it (markers or ⚡ triggers)' },
    react: { value: react, min: 0, max: 2, label: 'Music amount', group: 'Music' },
  });
  const D = (drive) => ({ drive: { value: drive, options: DRIVES, label: 'Fires on', group: 'Music' } });

  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(v));
  const line = (key, s, group) => {
    const parts = [`value: ${q(s.value)}`];
    if (s.options) parts.push(`options: [${s.options.map(q).join(', ')}]`);
    if (s.min != null) parts.push(`min: ${s.min}`, `max: ${s.max}`);
    if (s.step != null) parts.push(`step: ${s.step}`);
    parts.push(`label: ${q(s.label)}`, `group: ${q(s.group || group)}`);
    if (s.hint) parts.push(`hint: ${q(s.hint)}`);
    return `  ${key}: { ${parts.join(', ')} },`;
  };
  const code = (type, what, P, group) => `// Filter layer: ${what}
// It changes everything below it. Its settings are the sliders; the layer's opacity mixes it with the original,
// and its bar on the timeline sets when it's on.
const P = tweak({
${Object.entries(P).map(([k, s]) => line(k, s, group)).join('\n')}
});
filter('${type}', P);
`;
  // [id, name, category, shader type, description, params, extra tags]
  const LIST = [
    // ---------- glitch ----------
    ['rgbsplit', 'RGB split', 'Glitch', 'rgbsplit', 'Red, green and blue pulled apart, harder on kicks', { amount: n(0.6, 0, 3, 'Split'), angle: n(0, 0, 360, 'Angle'), spin: n(0, -3, 3, 'Spin'), radial: b(false, 'From the center out'), ...M('kick', 1) }, 'chromatic rgb shift'],
    ['blockglitch', 'Block glitch', 'Glitch', 'blockglitch', 'Rectangles of the picture jump, swap colors and invert on hits', { amount: n(0.6, 0, 1, 'Amount'), block: n(3, 0.5, 12, 'Block size'), shift: n(0.5, 0, 2, 'Jump distance'), rate: n(12, 1, 30, 'Changes per second'), colorize: b(true, 'Swap colors'), ...M('hit', 1.2) }, 'digital corrupt'],
    ['scantear', 'Scanline tear', 'Glitch', 'scantear', 'Horizontal lines tear sideways', { amount: n(0.6, 0, 1, 'Amount'), lines: n(60, 4, 300, 'Lines', 1), speed: n(15, 1, 60, 'Changes per second'), dark: n(0.3, 0, 1, 'Darken torn lines'), ...M('snare', 1) }, 'tear rows'],
    ['pixelsort', 'Pixel sort', 'Glitch', 'pixelsort', 'Bright areas smear into streaks, like sorted pixels', { threshold: n(0.55, 0, 1, 'Only above brightness'), length: n(0.3, 0.02, 1, 'Streak length'), direction: o('down', ['down', 'up', 'right', 'left'], 'Direction'), mix: n(1, 0, 1, 'Amount'), ...M('bass', 0.6) }, 'sort streak'],
    ['moshmelt', 'Datamosh melt', 'Glitch', 'moshmelt', 'Frames melt and drip into each other in blocks', { amount: n(0.5, 0, 1, 'Mosh amount'), block: n(16, 4, 96, 'Block size', 1), smear: n(0.8, 0, 3, 'Smear'), gravity: n(0.4, -1, 1, 'Drip down'), persist: n(0.95, 0, 0.995, 'Trail length'), ...M('kick', 1) }, 'datamosh melt'],
    ['moshbloom', 'Datamosh bloom', 'Glitch', 'moshbloom', 'Still areas freeze and bloom outward while motion breaks through', { amount: n(0.6, 0, 1, 'Mosh amount'), block: n(24, 4, 96, 'Block size', 1), zoom: n(0.6, -2, 2, 'Bloom outward'), sensitivity: n(0.25, 0.02, 1, 'Motion breaks through'), ...M('kick', 1) }, 'datamosh p-frame'],
    ['moshfreeze', 'Datamosh freeze', 'Glitch', 'moshfreeze', 'Random blocks freeze (dropped I-frames), more on hits', { amount: n(0.3, 0, 1, 'Frozen blocks'), block: n(32, 4, 128, 'Block size', 1), rate: n(4, 0.5, 20, 'Changes per second'), slip: n(0.5, -3, 3, 'Frozen blocks slide'), ...M('hit', 1.2) }, 'datamosh i-frame'],
    ['digitalnoise', 'Digital noise', 'Glitch', 'digitalnoise', 'Corrupted static and broken lines', { amount: n(0.4, 0, 1.5, 'Amount'), size: n(2, 1, 12, 'Noise size'), colored: b(true, 'Colored noise'), ...M('snare', 1) }, 'static corrupt'],
    ['jpeg', 'JPEG crunch', 'Glitch', 'jpeg', 'Over-compressed: 8×8 blocks and color smear, worse on kicks', { quality: n(12, 2, 40, 'Quality'), blocky: n(0.5, 0, 1, 'Blockiness'), ...M('kick', 0.8) }, 'compression artifacts'],
    ['interlace', 'Interlace', 'Glitch', 'interlace', 'Every other line shifts, like a bad deinterlace', { thickness: n(2, 1, 8, 'Line height', 1), offset: n(0.6, 0, 3, 'Shift'), dark: n(0.25, 0, 1, 'Darken odd lines'), ...M('bass', 1) }, 'fields lines'],
    ['wobble', 'Wave tear', 'Glitch', 'wobble', 'Rows wave sideways with color fringes', { amount: n(0.6, 0, 3, 'Amount'), frequency: n(12, 1, 60, 'Waves'), speed: n(3, 0, 12, 'Speed'), ...M('level', 1) }, 'vhs warp wave'],
    ['chromaglitch', 'Chroma bands', 'Glitch', 'chromaglitch', 'Bands of the picture slip and change hue on hits', { amount: n(0.5, 0, 1.5, 'Amount'), bands: n(24, 2, 120, 'Bands', 1), ...M('hit', 1.5) }, 'hue slices'],
    ['bitcrush', 'Bit crush', 'Glitch', 'bitcrush', 'Few colors with ordered dithering', { bits: n(3, 1, 8, 'Bits per color', 1), pixel: n(2, 1, 16, 'Pixel size', 1), dither: n(0.8, 0, 1, 'Dither') }, '8-bit retro'],
    ['displace', 'Noise displace', 'Glitch', 'displace', 'The picture warps along flowing noise', { amount: n(0.5, 0, 3, 'Amount'), scale: n(3, 0.5, 12, 'Noise size'), speed: n(0.3, 0, 3, 'Flow speed'), ...M('bass', 1) }, 'warp distort'],
    // ---------- film ----------
    ['grain', 'Film grain', 'Film', 'grain', 'Fine animated grain, stronger in the shadows', { amount: n(0.35, 0, 1.5, 'Amount'), size: n(1.5, 1, 6, 'Grain size'), colored: b(false, 'Colored grain'), shadows: n(0.6, 0, 1, 'More in the shadows'), ...M('off', 0) }, 'noise texture'],
    ['halation', 'Halation', 'Film', 'halation', 'Red-orange glow bleeding around highlights, like real film', { strength: n(0.8, 0, 3, 'Strength'), radius: n(1.5, 0.2, 5, 'Size'), threshold: n(0.6, 0, 1, 'Only above brightness'), tint: c('#ff5a2a', 'Glow color'), ...M('kick', 0.4) }, 'cinestill glow'],
    ['gateweave', 'Gate weave', 'Film', 'gateweave', 'The frame drifts and jitters like film in a projector', { amount: n(0.5, 0, 2, 'Weave'), speed: n(2, 0, 8, 'Speed'), jitter: n(0.4, 0, 2, 'Jitter'), flicker: n(0.4, 0, 1, 'Flicker'), frameline: n(0, 0, 1, 'Frame line') }, 'projector'],
    ['lightleak', 'Light leaks', 'Film', 'lightleak', 'Warm drifting light leaks from the edges', { strength: n(0.7, 0, 2, 'Strength'), color1: c('#ff7a2f', 'Leak color 1'), color2: c('#ff2f6a', 'Leak color 2'), speed: n(0.4, 0, 3, 'Drift'), ...M('beat', 0.4) }, 'leak burn'],
    ['vignette', 'Vignette', 'Film', 'vignette', 'Dark (or colored) corners that can pulse with the music', { amount: n(0.6, 0, 1.5, 'Amount'), softness: n(0.5, 0.05, 1, 'Softness'), round: n(1, 0, 1, 'Round (vs frame shaped)'), color: c('#000000', 'Color'), ...M('kick', 0.3) }, 'corners'],
    ['tape', 'VHS tape', 'Film', 'tape', 'Smeared color, wobble, dropouts and head-switching noise', { wobble: n(0.6, 0, 3, 'Wobble'), bleed: n(0.6, 0, 3, 'Color bleed'), noise: n(0.3, 0, 1, 'Noise'), dropouts: n(0.4, 0, 3, 'Dropouts'), headswitch: n(1, 0, 1, 'Head switching noise') }, 'vhs analog'],
    ['crtroll', 'CRT monitor', 'Film', 'crtroll', 'Aperture grille, scanlines, glow and a rolling bar', { scanlines: n(0.5, 0, 1, 'Scanlines'), glow: n(0.4, 0, 2, 'Glow'), roll: n(0.5, 0, 4, 'Rolling bar speed'), bar: n(0.4, 0, 1, 'Rolling bar'), grille: n(0.3, 0, 1, 'Grille'), flicker: n(0.5, 0, 2, 'Flicker'), ...M('kick', 0.3) }, 'tv monitor'],
    ['super8', '8mm film', 'Film', 'super8', 'Super 8 home movie: grain, weave, warm color, scratches', { grain: n(0.5, 0, 1.5, 'Grain'), weave: n(0.6, 0, 3, 'Weave'), warmth: n(0.5, -1, 1, 'Warmth'), scratches: n(0.6, 0, 2, 'Scratches & dust'), flicker: n(0.5, 0, 1, 'Flicker'), vignette: n(0.5, 0, 1, 'Dark corners') }, 'super 8 home movie'],
    ['dust', 'Dust & scratches', 'Film', 'dust', 'Specks, hairs and scratch lines over the picture', { amount: n(0.6, 0, 3, 'Amount'), light: b(false, 'Light specks (else dark)'), ...M('snare', 0.5) }, 'scratches'],
    ['bleach', 'Bleach bypass', 'Film', 'bleach', 'Silvery, contrasty, less color', { amount: n(0.7, 0, 1, 'Amount'), contrast: n(1.2, 0.5, 2.5, 'Contrast') }, 'silver retention'],
    ['sepia', 'Sepia', 'Film', 'sepia', 'Old photo toning', { amount: n(0.85, 0, 1, 'Amount'), tone: c('#c08a52', 'Tone'), vignette: n(0.4, 0, 1, 'Dark corners') }, 'old photo'],
    ['letterbox', 'Letterbox', 'Frame', 'letterbox', 'Cinema bars for a wider (or other) ratio', { ratio: o('2.39:1', ['2.39:1', '2.0:1', '1.85:1', '4:3', '1:1', '9:16'], 'Ratio'), color: c('#000000', 'Bar color'), ...M('kick', 0) }, 'cinemascope bars'],
    // ---------- color ----------
    ['tritone', 'Tritone', 'Color', 'tritone', 'Three colors for shadows, mids and highlights', { shadows: c('#14062e', 'Shadows'), mids: c('#c2185b', 'Mids'), highlights: c('#ffd75e', 'Highlights'), contrast: n(1.1, 0.5, 3, 'Contrast'), balance: n(0, -1, 1, 'Balance'), mix: n(1, 0, 1, 'Amount') }, 'three colors'],
    ['gradientmap', 'Gradient map', 'Color', 'gradientmap', 'Brightness mapped onto a 4-color gradient that can cycle on the beat', { c1: c('#0b0221', 'Color 1 (dark)'), c2: c('#7b2ff7', 'Color 2'), c3: c('#f107a3', 'Color 3'), c4: c('#ffd75e', 'Color 4 (bright)'), contrast: n(1.1, 0.5, 3, 'Contrast'), offset: n(0, 0, 1, 'Offset'), cycle: n(0, -2, 2, 'Cycle speed'), mix: n(1, 0, 1, 'Amount'), ...M('kick', 0.3) }, 'palette map'],
    ['posterize', 'Posterize', 'Color', 'posterize', 'Flat bands of color', { levels: n(5, 2, 16, 'Levels', 1), gamma: n(1, 0.3, 2.5, 'Gamma'), ...M('kick', 0) }, 'bands flat'],
    ['huecycle', 'Hue cycle', 'Color', 'huecycle', 'Colors rotate around the color wheel, jumping on hits', { speed: n(1, -5, 5, 'Speed'), offset: n(0, 0, 1, 'Hue offset'), saturation: n(1.1, 0, 2, 'Saturation'), jump: n(0, 0, 1, 'Random jumps'), ...M('kick', 0.4) }, 'rainbow rotate'],
    ['infrared', 'Infrared', 'Color', 'infrared', 'Aerochrome-style false color infrared', { pink: n(0.6, 0, 1, 'Pink'), contrast: n(1.15, 0.5, 2, 'Contrast'), mix: n(1, 0, 1, 'Amount') }, 'aerochrome ir'],
    ['solarize', 'Solarize', 'Color', 'solarize', 'Bright parts flip negative (Sabattier)', { threshold: n(0.5, 0, 1, 'Threshold'), mono: b(false, 'Black & white'), mix: n(1, 0, 1, 'Amount'), ...M('kick', 0.5) }, 'sabattier'],
    ['invert', 'Invert', 'Color', 'invert', 'Negative, or a negative flash on hits', { amount: n(0, 0, 1, 'Always inverted'), keepHue: b(false, 'Keep the colors (brightness only)'), ...M('snare', 1) }, 'negative'],
    ['grade', 'Color grade', 'LUT', 'grade', 'A cinematic grade from a list of looks', { look: o('teal & orange', ['neutral', 'teal & orange', 'bleach', 'cross process', 'matrix', 'warm film', 'cold blue', 'faded pastel', 'noir', 'sunset', 'cyberpunk', 'kodachrome', 'forgeheart', 'vaporwave', 'moonlight', 'desert', 'emerald', 'rose gold'], 'Look'), mix: n(1, 0, 1, 'Amount') }, 'lut grade'],
    ['channelmix', 'Channel swap', 'Color', 'channelmix', 'Swap or isolate the red, green and blue channels', { swap: o('rgb → gbr', ['rgb → gbr', 'rgb → brg', 'rgb → grb', 'rgb → bgr', 'rgb → rbg', 'red only', 'green only', 'blue only'], 'Swap'), mix: n(1, 0, 1, 'Amount'), ...M('kick', 0) }, 'channels'],
    ['adjust', 'Adjust', 'Color', 'adjust', 'Brightness, contrast, saturation, vibrance, temperature, gamma', { brightness: n(0, -0.5, 0.5, 'Brightness'), contrast: n(1, 0, 2.5, 'Contrast'), saturation: n(1, 0, 2.5, 'Saturation'), vibrance: n(0, -1, 1, 'Vibrance'), temperature: n(0, -1, 1, 'Temperature'), tint: n(0, -1, 1, 'Tint'), gamma: n(1, 0.3, 2.5, 'Gamma'), ...M('kick', 0) }, 'basic correction'],
    ['colorize', 'Colorize', 'Color', 'colorize', 'Everything in one color', { color: c('#ff8c42', 'Color'), mix: n(0.85, 0, 1, 'Amount') }, 'mono tint'],
    ['splittone', 'Split tone', 'Color', 'splittone', 'One color in the shadows, another in the highlights', { shadows: c('#1f3a93', 'Shadows'), highlights: c('#ffb35c', 'Highlights'), balance: n(0, -1, 1, 'Balance'), amount: n(0.6, 0, 1, 'Amount') }, 'split toning'],
    ['nightvision', 'Night vision', 'Color', 'nightvision', 'Green image intensifier with noise', { gain: n(1.6, 0.5, 4, 'Gain'), noise: n(0.4, 0, 1, 'Noise'), scope: b(false, 'Round scope'), ...M('kick', 0.2) }, 'nvg green'],
    ['falsecolor', 'False color', 'Color', 'falsecolor', 'Brightness as rainbow bands with contour lines', { bands: n(8, 2, 24, 'Bands', 1), cycle: n(0, -3, 3, 'Cycle'), lines: n(0.4, 0, 1, 'Lines'), mix: n(1, 0, 1, 'Amount') }, 'contour rainbow'],
    ['levels', 'Levels', 'Color', 'levels', 'Black point, white point and gamma', { black: n(0.05, 0, 0.5, 'Black point'), white: n(0.95, 0.5, 1, 'White point'), gamma: n(1, 0.3, 2.5, 'Gamma'), outBlack: n(0, 0, 0.5, 'Output black'), outWhite: n(1, 0.5, 1, 'Output white') }, 'correction'],
    ['prism', 'Prism', 'Color', 'prism', 'A rainbow gradient washed over the picture', { angle: n(30, 0, 360, 'Angle'), spread: n(1, 0, 4, 'Spread'), speed: n(0.5, -3, 3, 'Speed'), mix: n(0.6, 0, 1, 'Amount'), ...M('kick', 0.3) }, 'rainbow iridescent'],
    ['selectivecolor', 'Selective color', 'Color', 'selectivecolor', 'Black & white except one color (Sin City)', { keep: c('#ff2a2a', 'Keep this color'), range: n(0.08, 0.01, 0.3, 'Range'), boost: n(0.3, 0, 1, 'Boost it') }, 'color splash'],
    ['neonize', 'Neonize', 'Color', 'neonize', 'Saturated neon colors with glow', { crush: n(1.4, 0.5, 3, 'Crush darks'), cycle: n(0, -2, 2, 'Hue cycle'), glow: n(0.8, 0, 3, 'Glow'), ...M('kick', 0.6) }, 'neon saturate'],
    ['heatmap', 'Heat map', 'Color', 'heatmap', 'Blue → cyan → yellow → red by brightness', { contrast: n(1.2, 0.5, 3, 'Contrast'), mix: n(1, 0, 1, 'Amount') }, 'jet scientific'],
    // ---------- stylize ----------
    ['dither', 'Dither', 'Stylize', 'dither', 'Ordered or noise dithering with retro palettes', { scale: n(2, 1, 8, 'Pixel size', 1), levels: n(2, 1, 8, 'Shades', 1), pattern: o('bayer 4', ['bayer 4', 'bayer 8', 'noise'], 'Pattern'), colors: o('source', ['source', '1-bit', 'game boy', 'two colors'], 'Colors'), contrast: n(1.1, 0.5, 2, 'Contrast'), animate: b(false, 'Animated noise'), dark: c('#1b1b2f', 'Dark color'), light: c('#f2e8cf', 'Light color') }, 'retro bayer'],
    ['asciimatrix', 'ASCII rain', 'Stylize', 'asciimatrix', 'Green code rain shaped by the picture', { cell: n(12, 6, 40, 'Character size', 1), contrast: n(1.4, 0.5, 3, 'Contrast'), speed: n(1, 0, 4, 'Rain speed'), tint: c('#38ff6a', 'Color'), background: n(0, 0, 0.6, 'Picture behind') }, 'matrix code text'],
    ['asciiblocks', 'ASCII blocks', 'Stylize', 'asciiblocks', 'Shade blocks ░▒▓█ instead of characters', { cell: n(8, 3, 32, 'Block size', 1), contrast: n(1.3, 0.5, 3, 'Contrast'), colors: b(false, 'One color'), tint: c('#ffd75e', 'Color') }, 'text shade'],
    ['asciidense', 'ASCII dense', 'Stylize', 'asciidense', 'A long 70-character ramp for detailed text art', { cell: n(7, 3, 24, 'Character size', 1), contrast: n(1.2, 0.5, 3, 'Contrast'), colors: b(true, 'Picture colors'), tint: c('#ffffff', 'Ink'), paper: c('#000000', 'Paper'), ...M('kick', 0) }, 'text art'],
    ['hexpixel', 'Hex pixels', 'Stylize', 'hexpixel', 'Hexagon mosaic', { size: n(18, 4, 80, 'Hex size'), outline: n(0.3, 0, 1, 'Outlines'), ...M('kick', 0.4) }, 'mosaic hexagon'],
    ['trimosaic', 'Triangle mosaic', 'Stylize', 'trimosaic', 'Low-poly triangles', { size: n(26, 6, 120, 'Triangle size'), shade: n(0.6, 0, 1, 'Facet shading') }, 'low poly'],
    ['crystal', 'Crystallize', 'Stylize', 'crystal', 'Moving Voronoi cells with outlines', { cells: n(14, 3, 60, 'Cells'), speed: n(0.5, 0, 3, 'Movement'), edges: n(0.5, 0, 1, 'Outlines'), edgeColor: c('#000000', 'Outline color'), ...M('kick', 0.5) }, 'voronoi cells'],
    ['mirror', 'Mirror', 'Distort', 'mirror', 'Reflect half (or a quarter) of the frame', { mode: o('left → right', ['left → right', 'right → left', 'top → bottom', 'bottom → top', 'four ways', 'diagonal'], 'Mirror') }, 'symmetry'],
    ['tile', 'Tile', 'Distort', 'tile', 'Repeat the picture in a grid that grows on hits', { tiles: n(2, 1, 8, 'Tiles', 1), mirrored: b(true, 'Mirror tiles'), gap: n(0, 0, 0.5, 'Gap'), shift: n(0, 0, 1, 'Hue per tile'), background: c('#000000', 'Gap color'), ...M('kick', 0) }, 'grid repeat'],
    ['fisheye', 'Fisheye', 'Distort', 'fisheye', 'Barrel lens distortion that breathes with the bass', { strength: n(0.6, -1, 3, 'Strength'), ...M('bass', 0.5) }, 'barrel lens'],
    ['bulge', 'Bulge / pinch', 'Distort', 'bulge', 'Bulge out (or pinch in) around a point', { x: n(0.5, 0, 1, 'Center X'), y: n(0.5, 0, 1, 'Center Y'), radius: n(0.35, 0.05, 1, 'Radius'), strength: n(0.6, -0.9, 2, 'Strength (− = pinch)'), ...M('kick', 0.8) }, 'pinch'],
    ['twirl', 'Twirl', 'Distort', 'twirl', 'A swirl in the middle', { angle: n(180, -720, 720, 'Angle'), radius: n(0.5, 0.05, 1.5, 'Radius'), speed: n(1, 0, 6, 'Wobble speed'), wobble: n(0.5, 0, 3, 'Wobble'), ...M('bass', 0.5) }, 'swirl'],
    ['ripple', 'Ripple', 'Distort', 'ripple', 'Water ripples from the center, sent by kicks', { amplitude: n(1, 0, 5, 'Height'), frequency: n(40, 5, 120, 'Rings'), speed: n(6, 0, 20, 'Speed'), falloff: n(2, 0, 8, 'Fade out'), shine: n(0.2, 0, 1, 'Shine'), ...M('kick', 1) }, 'water'],
    ['wavewarp', 'Wave warp', 'Distort', 'wavewarp', 'Sine waves bend the picture', { ampX: n(1, 0, 5, 'Sideways'), ampY: n(0.5, 0, 5, 'Up / down'), frequency: n(10, 1, 60, 'Waves'), speed: n(2, 0, 10, 'Speed'), ...M('level', 1) }, 'wave'],
    ['emboss', 'Emboss', 'Stylize', 'emboss', 'Raised relief, like stamped metal', { strength: n(4, 0, 15, 'Strength'), angle: n(45, 0, 360, 'Light angle'), depth: n(1.5, 0.5, 6, 'Depth'), color: n(0.3, 0, 1, 'Keep color') }, 'relief'],
    ['toon', 'Toon', 'Stylize', 'toon', 'Cel-shaded flat colors with ink outlines', { levels: n(4, 2, 10, 'Shades', 1), saturation: n(1.3, 0, 2.5, 'Saturation'), edge: n(0.25, 0.02, 1, 'Outline threshold'), thickness: n(1.5, 0.5, 4, 'Outline width'), ink: c('#0b0b12', 'Ink') }, 'cel cartoon'],
    ['neonglow', 'Neon edges', 'Stylize', 'neonglow', 'Glowing neon outlines (rainbow or one color)', { strength: n(3, 0, 10, 'Strength'), radius: n(1.5, 0.2, 5, 'Glow size'), color: c('#ff2bd6', 'Color'), rainbow: b(true, 'Rainbow'), keep: n(0.15, 0, 1, 'Original picture'), ...M('kick', 0.8) }, 'tron outline'],
    ['sketch', 'Pencil sketch', 'Stylize', 'sketch', 'Pencil lines and hatching on paper', { strength: n(4, 0, 12, 'Lines'), hatch: n(6, 2, 20, 'Hatching size'), shading: n(0.7, 0, 1, 'Shading'), ink: c('#1a1a1a', 'Pencil'), paper: c('#f3efe6', 'Paper') }, 'drawing pencil'],
    ['oilpaint', 'Oil paint', 'Stylize', 'oilpaint', 'Painterly brush areas (Kuwahara)', { radius: n(5, 1, 14, 'Brush size'), saturation: n(1.15, 0, 2, 'Saturation') }, 'painting kuwahara'],
    ['crosshatch', 'Crosshatch', 'Stylize', 'crosshatch', 'Ink cross-hatching by darkness', { spacing: n(8, 3, 30, 'Spacing'), width: n(1, 0.5, 4, 'Line width'), colors: b(false, 'Tinted paper'), ink: c('#101018', 'Ink'), paper: c('#f5f0e6', 'Paper') }, 'engraving ink'],
    ['ledwall', 'LED wall', 'Stylize', 'ledwall', 'A wall of glowing LED dots', { size: n(12, 4, 48, 'LED spacing'), dot: n(0.8, 0.2, 1, 'LED size'), glow: n(0.4, 0, 2, 'Glow'), off: c('#05070a', 'Off color'), ...M('kick', 0.6) }, 'dots screen stadium'],
    ['scanlines', 'Scanlines', 'Stylize', 'scanlines', 'Plain horizontal scanlines, optionally scrolling', { spacing: n(3, 1, 12, 'Spacing'), intensity: n(0.5, 0, 1, 'Darkness'), scroll: n(0, -10, 10, 'Scroll'), boost: n(0.4, 0, 1, 'Brighten'), ...M('hats', 0) }, 'lines'],
    ['polar', 'Polar / tunnel', 'Distort', 'polar', 'Wrap the picture into a circle, unwrap it, or fly through it as a tunnel', { mode: o('tunnel', ['to polar', 'from polar', 'tunnel'], 'Mode'), speed: n(0.5, -3, 3, 'Speed'), zoom: n(1, 0.2, 4, 'Zoom'), repeat: n(2, 1, 8, 'Repeats', 1) }, 'tunnel circle'],
    ['frosted', 'Frosted glass', 'Distort', 'frosted', 'Seen through bumpy frosted glass', { amount: n(0.6, 0, 3, 'Amount'), scale: n(30, 2, 120, 'Bump size'), frost: n(0.3, 0, 1, 'Frost'), ...M('kick', 0) }, 'glass'],
    ['glassblocks', 'Glass blocks', 'Distort', 'glassblocks', 'Seen through a wall of glass bricks', { columns: n(8, 2, 40, 'Columns'), refraction: n(1.5, 0, 6, 'Refraction'), bevel: n(0.5, 0, 1, 'Bevel'), ...M('kick', 0.5) }, 'glass bricks'],
    ['heathaze', 'Heat haze', 'Distort', 'heathaze', 'Shimmering hot air rising', { amount: n(0.6, 0, 3, 'Amount'), scale: n(6, 1, 30, 'Size'), speed: n(0.8, 0, 4, 'Speed'), fromBottom: n(0.6, 0, 1, 'Mostly at the bottom'), ...M('bass', 0.5) }, 'mirage shimmer'],
    ['contours', 'Contour lines', 'Stylize', 'contours', 'Topographic lines that follow brightness', { count: n(12, 2, 60, 'Lines'), thickness: n(1.5, 0.5, 6, 'Thickness'), flow: n(0.2, -2, 2, 'Flow'), colors: b(true, 'Rainbow lines'), line: c('#48ddff', 'Line color'), keep: n(0.25, 0, 1, 'Picture behind') }, 'topographic'],
    ['mandala', 'Mandala', 'Distort', 'mandala', 'Kaleidoscope with mirrored rings flowing outward', { segments: n(8, 2, 24, 'Segments', 1), rings: n(2, 0.5, 8, 'Rings'), spin: n(0.1, -2, 2, 'Spin'), flow: n(0.1, -2, 2, 'Flow'), zoom: n(1, 0.3, 3, 'Zoom'), ...M('kick', 0.5) }, 'kaleidoscope'],
    ['cmyk', 'CMYK print', 'Stylize', 'cmyk', 'Four rotated halftone screens like a magazine', { dot: n(7, 3, 30, 'Dot size'), black: n(0.9, 0, 1, 'Black ink'), paper: c('#f7f3ea', 'Paper') }, 'halftone print'],
    ['slitscan', 'Slit scan', 'Feedback', 'slitscan', 'One line of the picture smeared across time', { direction: o('up', ['up', 'down', 'left', 'right'], 'Direction'), speed: n(2, 0.2, 10, 'Speed'), position: n(0.5, 0, 1, 'Slit position'), ...M('level', 0.6) }, 'time smear'],
    ['outline', 'Outline', 'Stylize', 'outline', 'Clean outlines on a solid background', { width: n(1.5, 0.5, 6, 'Width'), threshold: n(0.08, 0, 0.5, 'Threshold'), fill: b(true, 'Solid background'), background: c('#0a0a0f', 'Background'), color: c('#ffffff', 'Line color'), ...M('kick', 0.5) }, 'line art'],
    ['stripes', 'Line shading', 'Stylize', 'stripes', 'The picture drawn with parallel lines of varying width', { angle: n(0, 0, 180, 'Angle'), spacing: n(8, 2, 40, 'Spacing'), weight: n(1, 0.2, 2, 'Weight'), speed: n(0, -10, 10, 'Scroll'), colors: b(false, 'Picture colors'), ink: c('#ffffff', 'Ink'), background: c('#000000', 'Background'), ...M('kick', 0.3) }, 'engrave lines'],
    // ---------- blur & light ----------
    ['bloom', 'Bloom', 'Blur & light', 'bloom', 'Soft glow around bright parts, pumping on kicks', { intensity: n(1, 0, 4, 'Intensity'), radius: n(1.2, 0.2, 4, 'Size'), threshold: n(0.6, 0, 1, 'Only above brightness'), tint: c('#ffffff', 'Tint'), ...M('kick', 0.5) }, 'glow'],
    ['zoomblur', 'Zoom blur', 'Blur & light', 'zoomblur', 'Radial blur from a point, punching on kicks', { strength: n(0.6, 0, 3, 'Strength'), x: n(0.5, 0, 1, 'Center X'), y: n(0.5, 0, 1, 'Center Y'), ...M('kick', 1.5) }, 'radial'],
    ['motionblur', 'Motion blur', 'Blur & light', 'motionblur', 'Blur in one direction', { angle: n(0, 0, 360, 'Angle'), length: n(12, 0, 80, 'Length'), ...M('kick', 0) }, 'directional'],
    ['tiltshift', 'Tilt-shift', 'Blur & light', 'tiltshift', 'Miniature look: a sharp band, blurred above and below', { focus: n(0.5, 0, 1, 'Focus height'), width: n(0.2, 0, 1, 'Sharp band'), falloff: n(0.25, 0.02, 1, 'Falloff'), blur: n(3, 0, 10, 'Blur'), saturation: n(1.25, 0, 2, 'Saturation') }, 'miniature'],
    ['godrays', 'God rays', 'Blur & light', 'godrays', 'Light shafts streaming from a point', { x: n(0.5, 0, 1, 'Light X'), y: n(0.7, 0, 1, 'Light Y'), density: n(0.8, 0.1, 2, 'Length'), decay: n(0.96, 0.8, 1, 'Decay'), threshold: n(0.55, 0, 1, 'Only above brightness'), strength: n(1, 0, 4, 'Strength'), tint: c('#fff1d6', 'Tint'), ...M('kick', 0.6) }, 'volumetric light shafts'],
    ['lensflare', 'Lens flare', 'Blur & light', 'lensflare', 'A drifting lens flare with ghosts and halo', { x: n(0.75, 0, 1, 'Light X'), y: n(0.75, 0, 1, 'Light Y'), strength: n(0.8, 0, 3, 'Strength'), drift: n(0.3, 0, 3, 'Drift'), tint: c('#ffd9a0', 'Tint'), ...M('kick', 0.6) }, 'flare sun'],
    ['chromatic', 'Chromatic aberration', 'Blur & light', 'chromatic', 'Lens color fringing toward the edges', { amount: n(0.6, 0, 4, 'Amount'), ...M('kick', 1) }, 'fringe lens'],
    ['anamorphic', 'Anamorphic streaks', 'Blur & light', 'anamorphic', 'Long horizontal blue streaks on highlights', { length: n(0.6, 0.1, 2, 'Length'), threshold: n(0.7, 0, 1, 'Only above brightness'), strength: n(1, 0, 4, 'Strength'), tint: c('#4aa8ff', 'Streak color'), ...M('kick', 0.5) }, 'jj abrams flare'],
    ['dreamglow', 'Dream glow', 'Blur & light', 'dreamglow', 'Soft-focus diffusion (Pro-Mist)', { amount: n(0.6, 0, 1.5, 'Amount'), radius: n(1.5, 0.2, 5, 'Softness'), tint: c('#ffe6f2', 'Tint'), ...M('level', 0.4) }, 'diffusion promist soft'],
    ['blur', 'Blur', 'Blur & light', 'blur', 'Plain soft blur (great for backgrounds)', { radius: n(6, 0, 40, 'Radius'), ...M('kick', 0) }, 'gaussian'],
    ['sharpen', 'Sharpen', 'Blur & light', 'sharpen', 'Crisper edges', { amount: n(0.6, 0, 3, 'Amount'), radius: n(1, 0.5, 3, 'Radius') }, 'unsharp'],
    ['starburst', 'Star filter', 'Blur & light', 'starburst', 'Star-shaped sparkles on bright points', { points: n(2, 2, 6, 'Rays', 1), angle: n(45, 0, 180, 'Angle'), length: n(6, 1, 20, 'Length'), threshold: n(0.7, 0, 1, 'Only above brightness'), strength: n(1.2, 0, 4, 'Strength'), ...M('kick', 0.5) }, 'sparkle cross'],
    ['shine', 'Shine sweep', 'Blur & light', 'shine', 'A glossy light band sweeping across, once per beat', { angle: n(30, 0, 180, 'Angle'), width: n(0.08, 0.01, 0.4, 'Width'), speed: n(1, 0, 5, 'Speed (when not on beat)'), onBeat: b(true, 'Sweep once per beat'), color: c('#ffffff', 'Color'), strength: n(0.8, 0, 3, 'Strength') }, 'gloss sweep'],
    // ---------- feedback ----------
    ['trails', 'Trails', 'Feedback', 'trails', 'Moving things leave fading trails', { decay: n(0.9, 0.5, 0.995, 'Trail length'), mode: o('brightest', ['brightest', 'add', 'blend'], 'Mode'), tint: c('#ffffff', 'Trail tint'), ...M('kick', 0) }, 'afterimage'],
    ['echo', 'Video echo', 'Feedback', 'echo', 'Echoes that zoom, turn and shift hue', { zoom: n(0.6, -3, 3, 'Zoom'), rotate: n(1, -10, 10, 'Turn'), decay: n(0.92, 0.5, 0.99, 'Echo length'), hue: n(1, -10, 10, 'Hue shift'), ...M('kick', 0.4) }, 'feedback'],
    ['zoomfeedback', 'Zoom feedback', 'Feedback', 'zoomfeedback', 'Infinite tunnel feedback: dark areas fill with the zooming past', { zoom: n(1, -4, 4, 'Zoom'), rotate: n(0.6, -10, 10, 'Turn'), drift: n(0.5, 0, 3, 'Drift'), decay: n(0.97, 0.5, 0.999, 'Decay'), key: n(0.1, 0, 1, 'Keep picture above brightness'), ...M('kick', 0.6) }, 'tunnel infinite'],
    ['liquid', 'Liquid smear', 'Feedback', 'liquid', 'The picture flows like paint in water', { amount: n(1, 0, 4, 'Flow'), scale: n(3, 0.5, 12, 'Swirl size'), gravity: n(0.3, -2, 2, 'Drift down'), persist: n(0.95, 0.5, 0.995, 'Persistence'), freshBright: n(0.6, 0, 1, 'Bright parts stay sharp'), ...M('bass', 0.6) }, 'smear paint'],
    ['ghost', 'Ghost', 'Feedback', 'ghost', 'A tinted onion-skin of the last frames', { amount: n(0.6, 0, 1, 'Amount'), offsetX: n(2, -10, 10, 'Offset X'), offsetY: n(0, -10, 10, 'Offset Y'), tint: c('#8ad8ff', 'Tint'), ...M('kick', 0.4) }, 'onion skin'],
    ['rgbtrail', 'RGB trails', 'Feedback', 'rgbtrail', 'Each color channel leaves a different trail length', { red: n(0.9, 0, 0.99, 'Red trail'), green: n(0.8, 0, 0.99, 'Green trail'), blue: n(0.6, 0, 0.99, 'Blue trail'), ...M('kick', 0) }, 'channel delay'],
    ['melt', 'Melt', 'Feedback', 'melt', 'Bright parts drip down the screen', { amount: n(1, 0, 4, 'Drip speed'), drips: n(30, 2, 200, 'Drips'), persist: n(0.9, 0.5, 0.99, 'Persistence'), ...M('bass', 0.6) }, 'drip'],
    ['kaleidofeedback', 'Kaleido feedback', 'Feedback', 'kaleidofeedback', 'Kaleidoscopic echoes folding into themselves', { segments: n(6, 2, 16, 'Segments', 1), spin: n(1, -5, 5, 'Spin'), zoom: n(0.5, -3, 3, 'Zoom'), decay: n(0.94, 0.5, 0.99, 'Echo length'), hue: n(2, -10, 10, 'Hue shift'), ...M('kick', 0.3) }, 'fractal'],
    // ---------- beat ----------
    ['kickshake', 'Kick shake', 'Beat', 'kickshake', 'Camera shake, twist and zoom on every kick', { amount: n(0.8, 0, 3, 'Shake'), rotate: n(3, 0, 20, 'Twist (degrees)'), zoom: n(0.5, 0, 2, 'Zoom punch'), split: n(0.8, 0, 3, 'Color split'), ...D('kick') }, 'camera shake'],
    ['snareflash', 'Snare flash', 'Beat', 'snareflash', 'A flash of color (or a negative) on every snare', { mode: o('add', ['add', 'screen', 'invert', 'tint'], 'Flash'), color: c('#ffffff', 'Color'), amount: n(0.7, 0, 2, 'Strength'), ...D('snare') }, 'flash'],
    ['strobe', 'Strobe', 'Beat', 'strobe', 'Strobe flashes or blackouts on beats, half / quarter beats or hits', { rate: o('every beat', ['every beat', 'half beats', 'quarter beats', 'kick', 'snare', 'hats', 'steady 10 Hz'], 'Rate'), duty: n(0.15, 0.02, 0.9, 'Flash length'), amount: n(1, 0, 1, 'Strength'), color: c('#ffffff', 'Color'), blackout: b(false, 'Blackout instead of flash') }, 'flash'],
    ['basszoom', 'Bass zoom', 'Beat', 'basszoom', 'The frame punches in with the bass', { amount: n(0.6, 0, 3, 'Zoom'), blur: n(0.5, 0, 2, 'Zoom blur'), brighten: n(0.15, 0, 1, 'Brighten'), ...D('bass') }, 'pulse punch'],
    ['beatinvert', 'Beat invert', 'Beat', 'beatinvert', 'Flips to negative while a hit sounds', { threshold: n(0.6, 0.1, 1, 'How strong a hit'), half: b(false, 'Only half the frame'), ...D('kick') }, 'negative flash'],
    ['beatsplit', 'Beat shatter', 'Beat', 'beatsplit', 'The frame shatters into tiles on hits and snaps back', { amount: n(1, 0, 3, 'Amount'), tiles: n(4, 2, 16, 'Tiles', 1), ...D('hit') }, 'shatter tiles'],
    ['hatsglitter', 'Hi-hat glitter', 'Beat', 'hatsglitter', 'Sparkles on bright areas with every hi-hat', { amount: n(1, 0, 3, 'Amount'), size: n(2, 1, 6, 'Sparkle size'), density: n(1, 0.1, 5, 'Density'), threshold: n(0.4, 0, 1, 'Only above brightness'), color: c('#ffffff', 'Color'), ...D('hats') }, 'sparkle'],
    ['dropboom', 'Drop boom', 'Beat', 'dropboom', 'A big zoom, split and flash when the drop hits', { amount: n(1, 0, 2, 'Amount'), flash: n(0.6, 0, 1, 'Flash'), color: c('#ffffff', 'Flash color'), ...D('drop') }, 'drop impact'],
    ['pulsevignette', 'Pulse vignette', 'Beat', 'pulsevignette', 'The dark edges breathe in on every hit', { size: n(0.8, 0.2, 2, 'Size'), pulse: n(0.5, 0, 2, 'Pulse'), amount: n(0.8, 0, 1, 'Amount'), color: c('#000000', 'Color'), ...D('kick') }, 'breathe'],
    // ---------- frame ----------
    ['border', 'Glow border', 'Frame', 'border', 'A rounded frame with glow, great for social posts', { thickness: n(18, 0, 120, 'Thickness'), radius: n(30, 0, 200, 'Corner radius'), color: c('#ffd75e', 'Color'), rainbow: b(false, 'Rainbow'), glow: n(0.6, 0, 3, 'Glow'), ...M('kick', 0.4) }, 'frame social'],
    ['scanframe', 'Viewfinder', 'Frame', 'scanframe', 'Camera viewfinder corners and a center cross', { length: n(0.08, 0.02, 0.3, 'Corner length'), width: n(0.006, 0.001, 0.03, 'Line width'), margin: n(0.04, 0, 0.2, 'Margin'), cross: n(0.5, 0, 1, 'Center cross'), color: c('#48ddff', 'Color'), ...M('kick', 0.4) }, 'hud camera'],
  ];
  // Presets of the shaders above (and of the original filters) with a different character.
  const VARIANTS = [
    ...['teal & orange', 'bleach', 'cross process', 'matrix', 'warm film', 'cold blue', 'faded pastel', 'noir', 'sunset', 'cyberpunk', 'kodachrome', 'forgeheart', 'vaporwave', 'moonlight', 'desert', 'emerald', 'rose gold']
      .map((look) => [`grade-${look.replace(/\W+/g, '-')}`, `Grade · ${look[0].toUpperCase()}${look.slice(1)}`, 'LUT', 'grade', `Color grade preset: ${look}`, { look: { value: look }, mix: { value: 1 } }]),
    ['dither-gameboy', 'Game Boy', 'Stylize', 'dither', 'Four greens, chunky pixels', { scale: { value: 3 }, levels: { value: 3 }, colors: { value: 'game boy' } }],
    ['dither-1bit', '1-bit dither', 'Stylize', 'dither', 'Pure black and white Bayer dither', { scale: { value: 2 }, levels: { value: 1 }, colors: { value: '1-bit' }, pattern: { value: 'bayer 8' } }],
    ['dither-twotone', 'Two-tone dither', 'Stylize', 'dither', 'Dithered into your two colors', { scale: { value: 2 }, levels: { value: 2 }, colors: { value: 'two colors' }, dark: { value: '#2b0f54' }, light: { value: '#ff9e4a' } }],
    ['dither-noise', 'Noise dither', 'Stylize', 'dither', 'Animated noise dithering', { pattern: { value: 'noise' }, animate: { value: true }, levels: { value: 3 } }],
    ['mirror-quad', 'Mirror · four ways', 'Distort', 'mirror', 'Quad symmetry', { mode: { value: 'four ways' } }],
    ['mirror-vertical', 'Mirror · top to bottom', 'Distort', 'mirror', 'Reflect the top half down', { mode: { value: 'top → bottom' } }],
    ['polar-to', 'Little planet', 'Distort', 'polar', 'The picture wrapped into a circle', { mode: { value: 'to polar' }, speed: { value: 0.2 } }],
    ['polar-from', 'Unwrap', 'Distort', 'polar', 'A circle unwrapped into a band', { mode: { value: 'from polar' } }],
    ['strobe-kick', 'Kick strobe', 'Beat', 'strobe', 'White flash on every kick', { rate: { value: 'kick' }, amount: { value: 0.8 } }],
    ['strobe-blackout', 'Blackout strobe', 'Beat', 'strobe', 'Blackouts on half beats', { rate: { value: 'half beats' }, blackout: { value: true }, duty: { value: 0.5 } }],
    ['letterbox-43', '4:3 frame', 'Frame', 'letterbox', 'Old TV ratio', { ratio: { value: '4:3' } }],
    ['letterbox-square', 'Square frame', 'Frame', 'letterbox', '1:1 inside any frame size', { ratio: { value: '1:1' } }],
    ['rgbsplit-radial', 'Lens split', 'Glitch', 'rgbsplit', 'RGB split growing toward the edges', { radial: { value: true }, amount: { value: 1.2 } }],
    ['trails-long', 'Long exposure', 'Feedback', 'trails', 'Very long trails, like a long exposure', { decay: { value: 0.98 }, mode: { value: 'brightest' } }],
    ['echo-spiral', 'Spiral echo', 'Feedback', 'echo', 'Echoes spiral inward', { zoom: { value: 1.6 }, rotate: { value: 4 }, hue: { value: 3 } }],
    ['bloom-heavy', 'Bloom · heavy', 'Blur & light', 'bloom', 'Big bright glow', { intensity: { value: 2.4 }, radius: { value: 2.2 }, threshold: { value: 0.45 } }],
    ['vignette-pulse', 'Vignette · pulsing', 'Beat', 'vignette', 'Corners close in on kicks', { amount: { value: 0.8 }, react: { value: 1.2 } }],
    ['grain-heavy', 'Film grain · heavy', 'Film', 'grain', 'Coarse 16mm grain', { amount: { value: 0.8 }, size: { value: 2.5 } }],
    ['hexpixel-big', 'Hex pixels · chunky', 'Stylize', 'hexpixel', 'Huge hexagons that pump', { size: { value: 48 }, react: { value: 0.8 } }],
    ['bitcrush-nes', '8-bit console', 'Stylize', 'bitcrush', 'Big pixels, 2 bits per channel', { bits: { value: 2 }, pixel: { value: 6 } }],
    ['gradientmap-fire', 'Gradient map · fire', 'Color', 'gradientmap', 'Black → red → orange → yellow', { c1: { value: '#000000' }, c2: { value: '#7a0a00' }, c3: { value: '#ff5a00' }, c4: { value: '#ffe08a' } }],
    ['gradientmap-ice', 'Gradient map · ice', 'Color', 'gradientmap', 'Navy → blue → cyan → white', { c1: { value: '#020414' }, c2: { value: '#0b3d91' }, c3: { value: '#3fd0ff' }, c4: { value: '#f2fdff' } }],
    ['gradientmap-forge', 'Gradient map · Forgeheart', 'Color', 'gradientmap', 'Forge colors: violet, ember, gold', { c1: { value: '#0d0614' }, c2: { value: '#6b2fd6' }, c3: { value: '#ff6a2a' }, c4: { value: '#ffd75e' } }],
    ['posterize-3', 'Poster · 3 levels', 'Color', 'posterize', 'Very flat, screen-print look', { levels: { value: 3 } }],
    ['twirl-strong', 'Whirlpool', 'Distort', 'twirl', 'A strong spinning whirlpool', { angle: { value: 540 }, radius: { value: 0.8 } }],
    ['ripple-drop', 'Rain drop', 'Distort', 'ripple', 'Gentle water ripples', { amplitude: { value: 0.5 }, frequency: { value: 70 }, speed: { value: 3 } }],
    ['ascii-green', 'ASCII · terminal', 'Stylize', 'ascii', 'Green terminal characters', { colors: { value: 'green' }, cell: { value: 9 } }],
    ['vhs-worn', 'VHS · worn out', 'Film', 'vhs', 'A tape played a hundred times', { grain: { value: 0.6 }, jitter: { value: 0.7 }, tracking: { value: 0.8 }, fade: { value: 0.6 } }],
    ['glitch-subtle', 'Glitch · subtle', 'Glitch', 'glitch', 'Small, tasteful glitches on hits', { amount: { value: 0.3 }, split: { value: 0.25 } }],
    ['crt-arcade', 'CRT · arcade', 'Film', 'crt', 'Strong curve and phosphor glow', { curve: { value: 1 }, glow: { value: 0.8 }, mask: { value: 0.6 } }],
  ];
  const CATS = { ascii: 'Stylize', datamosh: 'Glitch', vhs: 'Film', glitch: 'Glitch', crt: 'Film', pixelate: 'Stylize', halftone: 'Stylize', film: 'Film', kaleido: 'Distort', edges: 'Stylize', thermal: 'Color', duotone: 'Color', glow: 'Blur & light' };
  // the original filters: category, shader type and their slider specs (read from their code)
  // (the hub's CSP has no eval: each "key: { … }," line is turned into JSON)
  const specOf = (src) => {
    const m = /tweak\(\{([\s\S]*?)\n\}\);/.exec(src);
    const out = {};
    for (const ln of (m?.[1] || '').split('\n')) {
      const r = /^\s*(\w+):\s*(\{.*\}),?\s*$/.exec(ln);
      if (!r) continue;
      const json = r[2].replace(/'((?:[^'\\]|\\.)*)'/g, (_, s) => JSON.stringify(s.replace(/\\'/g, "'"))).replace(/([{,]\s*)(\w+):/g, '$1"$2":');
      try { out[r[1]] = JSON.parse(json); } catch { /* not a plain spec line */ }
    }
    return out;
  };
  for (const t of ThreeLayers.FILTERS) {
    t.cat ||= CATS[t.id] || 'Stylize';
    t.type ||= /filter\(\s*'([\w-]+)'/.exec(t.code)?.[1] || t.id;
    t.spec ||= specOf(t.code);
  }
  const byType = Object.fromEntries([...LIST.map(([, , , type, , P]) => [type, P]), ...ThreeLayers.FILTERS.map((t) => [t.type, t.spec])]);
  const nameOf = Object.fromEntries([...LIST.map(([, name, , type]) => [type, name]), ...ThreeLayers.FILTERS.map((t) => [t.type, t.name])]);
  const add = (id, name, cat, type, desc, P, tags = '') => {
    if (ThreeLayers.FILTERS.some((t) => t.id === id)) return;
    // the code text is built the first time something reads it (≈150 of them at startup cost ~13 ms)
    let src = null;
    const t = { id, name, cat, type, desc, tags, spec: P };
    Object.defineProperty(t, 'code', { get: () => (src ??= code(type, name.toLowerCase(), P, nameOf[type] || name)), set: (v) => { src = v; }, enumerable: true, configurable: true });
    t.pack = 'fx';
    ThreeLayers.FILTERS.push(t);
  };
  for (const [id, name, cat, type, desc, P, tags] of LIST) add(id, name, cat, type, desc, P, tags);
  for (const [id, name, cat, type, desc, over] of VARIANTS) {
    const base = byType[type];
    if (!base) continue;
    const P = Object.fromEntries(Object.entries(base).map(([k, s]) => [k, over[k] ? { ...s, ...over[k] } : s]));
    add(id, name, cat, type, desc, P, 'preset');
  }
  // filter code with some values changed (looks and chat commands use it): ThreeLayers.filterCode('bloom', { intensity: 2 })
  ThreeLayers.filterCode = (id, values = {}) => {
    const t = ThreeLayers.FILTERS.find((x) => x.id === id);
    if (!t) return null;
    if (!Object.keys(values).length) return t.code;
    const P = Object.fromEntries(Object.entries(t.spec).map(([k, s]) => [k, k in values ? { ...s, value: values[k] } : s]));
    return code(t.type, t.name.toLowerCase(), P, nameOf[t.type] || t.name);
  };
  // default values per filter (the picker's thumbnails and the shader check use them)
  ThreeLayers.filterValues = (id, values = {}) => {
    const t = ThreeLayers.FILTERS.find((x) => x.id === id);
    return t ? { ...Object.fromEntries(Object.entries(t.spec).map(([k, s]) => [k, s.value])), ...values } : null;
  };
})();
