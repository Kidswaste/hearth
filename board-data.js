// Mood board presets (board.js uses them; every family is reachable from a right-click submenu, the "+ Add" menu
// and a chat command). Plain data plus a few tiny pure helpers, so dev tests can load it in Node too.
//   LAYOUTS     auto-arrange presets       (kind + options; board-layout.js does the geometry)
//   TEMPLATES   board starters             (frames + labels)
//   LENSES      ways to look at the board  (recolor the view by its vibe; board.css + board.js)
//   FILTERS     item looks                 (CSS filter strings; the export draws them too)
//   BLENDS, NOTE_STYLES, TEXT_STYLES, BACKGROUNDS, FRAME_SIZES, FRAME_COLORS, CROPS, HARMONIES, PALETTES,
//   FOCUS (what part of a vibe goes to a chat), TRANSITIONS (presentation), EXPORTS, STAMPS, MOODS
const BoardData = (() => {
  // ---------- auto-arrange ----------
  const L = (id, name, kind, opts = {}, desc = '') => ({ id, name, kind, opts, desc });
  const LAYOUTS = [
    L('grid', 'Grid', 'grid', { gap: 24 }, 'even rows, cells fit each item'),
    L('grid-tight', 'Tight grid', 'grid', { gap: 6 }, 'grid with hairline gaps'),
    L('grid-airy', 'Airy grid', 'grid', { gap: 80 }, 'lots of breathing room'),
    L('grid-2', 'Grid · 2 columns', 'grid', { cols: 2, gap: 24 }),
    L('grid-3', 'Grid · 3 columns', 'grid', { cols: 3, gap: 24 }),
    L('grid-4', 'Grid · 4 columns', 'grid', { cols: 4, gap: 24 }),
    L('grid-6', 'Grid · 6 columns', 'grid', { cols: 6, gap: 16 }),
    L('square-cells', 'Square cells', 'grid', { gap: 16, square: true }, 'every item in the same square'),
    L('contact', 'Contact sheet', 'grid', { gap: 4, square: true, size: 220 }, 'small equal squares like a film contact sheet'),
    L('masonry', 'Masonry', 'masonry', { gap: 20 }, 'Pinterest-style columns'),
    L('masonry-3', 'Masonry · 3 columns', 'masonry', { cols: 3, gap: 20 }),
    L('masonry-5', 'Masonry · 5 columns', 'masonry', { cols: 5, gap: 14 }),
    L('masonry-wide', 'Masonry · wide columns', 'masonry', { width: 560, gap: 28 }),
    L('row', 'One row', 'row', { gap: 24 }, 'same height, side by side'),
    L('filmstrip', 'Filmstrip', 'row', { gap: 4, height: 260 }, 'a tight strip of equal heights'),
    L('column', 'One column', 'column', { gap: 24 }, 'same width, stacked'),
    L('timeline', 'Timeline strip (oldest → newest)', 'strip', { by: 'added', gap: 32 }, 'in the order you added them'),
    L('timeline-duration', 'Timeline strip by length', 'strip', { by: 'duration', gap: 32 }, 'clips sized by duration, stills as beats'),
    L('timeline-pacing', 'Timeline strip by pacing', 'strip', { by: 'pacing', gap: 32 }, 'slow cuts first, fast cuts last'),
    L('collage', 'Collage', 'collage', { gap: 0, rotate: 0 }, 'packed edge to edge'),
    L('collage-tilt', 'Collage, tilted', 'collage', { gap: -20, rotate: 4 }, 'overlapping with a small tilt'),
    L('polaroid', 'Polaroid scatter', 'scatter', { spread: 1.1, rotate: 8 }, 'loose and handmade'),
    L('scatter', 'Scatter', 'scatter', { spread: 1.6, rotate: 0 }),
    L('pile', 'Pile', 'stack', { offset: 18, rotate: 6 }, 'stacked like prints on a desk'),
    L('deck', 'Card deck', 'stack', { offset: 40, rotate: 0 }, 'fanned to the right'),
    L('circle', 'Circle', 'circle', {}, 'a ring around the center'),
    L('spiral', 'Spiral', 'spiral', {}, 'first item in the middle'),
    L('diagonal', 'Diagonal', 'diagonal', { gap: 30 }),
    L('zigzag', 'Zigzag', 'zigzag', { gap: 30 }),
    L('honeycomb', 'Honeycomb', 'honeycomb', { gap: 14 }, 'offset rows'),
    L('bento', 'Bento', 'bento', { gap: 16 }, 'one hero, the rest around it'),
    L('hero-row', 'Hero + row', 'hero', { gap: 20 }, 'the first selected big, the rest underneath'),
    L('pack', 'Pack (no gaps)', 'pack', { gap: 12 }, 'shelves, fewest holes'),
    L('tidy', 'Tidy up', 'tidy', { cell: 40 }, 'keeps your arrangement, snaps it to a grid'),
    L('by-hue', 'Rainbow (by hue)', 'sort', { by: 'hue', then: 'grid' }, 'reds to violets, grays last'),
    L('by-light', 'Dark → bright', 'sort', { by: 'light', then: 'row' }),
    L('by-sat', 'Muted → vivid', 'sort', { by: 'sat', then: 'row' }),
    L('by-warmth', 'Cool → warm', 'sort', { by: 'warmth', then: 'row' }),
    L('by-contrast', 'Soft → punchy', 'sort', { by: 'contrast', then: 'row' }),
    L('by-motion', 'Calm → energetic', 'sort', { by: 'motion', then: 'row' }, 'videos by motion energy'),
    L('by-texture', 'Clean → busy', 'sort', { by: 'edges', then: 'grid' }, 'by texture / edge density'),
    L('color-wheel', 'Color wheel', 'wheel', {}, 'angle = hue, distance = lightness'),
    L('cols-type', 'Columns by kind', 'groupBy', { by: 'type' }, 'pictures, clips, sites, notes, colors'),
    L('cols-tag', 'Columns by tag', 'groupBy', { by: 'tag' }),
    L('cols-stamp', 'Columns by stamp', 'groupBy', { by: 'stamp' }, '★ / ✓ / ✕ …'),
    L('cols-mood', 'Columns by mood', 'groupBy', { by: 'mood' }, 'by each item\'s first mood word'),
    L('cols-temp', 'Warm · neutral · cool', 'groupBy', { by: 'temp' }),
    L('cols-family', 'Columns by color family', 'groupBy', { by: 'family' }),
    L('cols-light', 'Low-key · mid · high-key', 'groupBy', { by: 'key' }),
    L('cols-aspect', 'Columns by shape', 'groupBy', { by: 'aspect' }, 'portrait / square / landscape'),
  ];

  // ---------- board starters ----------
  // frames: [title, w, h, color?]; cols: frames per row; notes: { frame title: hint }
  const T = (id, name, cat, frames, opts = {}) => ({ id, name, cat, frames: frames.map((f) => (typeof f === 'string' ? [f] : f)), cols: opts.cols || Math.min(3, frames.length), size: opts.size || [520, 400], notes: opts.notes || {}, color: opts.color || null, title: opts.title ?? name });
  const SOC = [540, 960];
  const TEMPLATES = [
    T('moodboard', 'Moodboard', 'Basics', ['Mood', 'Palette', 'Light', 'Motion', 'Texture', 'Type'], { notes: { Mood: 'Drop pictures and clips that feel right' } }),
    T('mood-3', 'Three columns: palette · light · motion', 'Basics', [['Palette', 520, 900], ['Light', 520, 900], ['Motion', 520, 900]]),
    T('refs-avoid', 'Want · avoid', 'Basics', [['Want', 760, 760, '#3bd16f'], ['Avoid', 760, 760, '#ff5a5a']], { notes: { Avoid: 'Hearth tells the chats what not to do' } }),
    T('kanban', 'Try · trying · keep', 'Basics', [['To try', 480, 900], ['Trying', 480, 900], ['Keep', 480, 900, '#f2c94c']]),
    T('weekly', 'Weekly inspiration', 'Basics', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Weekend'], { size: [420, 420] }),
    T('a-b', 'A / B looks', 'Basics', [['Look A', 760, 560], ['Look B', 760, 560]]),
    T('before-after', 'Before / after', 'Basics', [['Before', 760, 560], ['After', 760, 560]]),
    T('blank-frames', 'Four empty frames', 'Basics', ['1', '2', '3', '4'], { cols: 2, title: '' }),
    T('music-video', 'Music video treatment', 'Music', ['Song feel', 'Palette', 'Light', 'Camera & motion', 'Cut pacing', 'Type & titles', 'Key moments', 'Avoid'], { cols: 4 }),
    T('visualizer', 'Music visualizer', 'Music', ['Drop energy', 'Calm parts', 'Palette', 'Shapes & textures', 'Reactions to the beat', 'Frame sizes'], { notes: { 'Reactions to the beat': 'What should hit on the kick?' } }),
    T('album-cover', 'Album cover', 'Music', [['Cover', 600, 600], 'Type', 'Palette', 'Back cover'], { cols: 2 }),
    T('tour-poster', 'Tour poster', 'Music', [['Poster', 500, 700], 'Type', 'Palette', 'Photos']),
    T('lyric-video', 'Lyric video', 'Music', ['Type in motion', 'Backgrounds', 'Palette', 'Timing']),
    T('dj-set', 'DJ set visuals', 'Music', ['Warm-up', 'Build', 'Peak', 'Cool-down'], { cols: 4 }),
    T('social-reel', 'Social reel (9:16)', 'Social', [['Hook 0–2 s', ...SOC], ['Middle', ...SOC], ['Payoff', ...SOC], ['End card', ...SOC]], { cols: 4 }),
    T('carousel', 'Carousel 4:5', 'Social', [['Slide 1', 432, 540], ['Slide 2', 432, 540], ['Slide 3', 432, 540], ['Slide 4', 432, 540], ['Slide 5', 432, 540]], { cols: 5 }),
    T('thumbs', 'Thumbnail tests (16:9)', 'Social', [['Thumb A', 640, 360], ['Thumb B', 640, 360], ['Thumb C', 640, 360], ['Thumb D', 640, 360]], { cols: 2 }),
    T('story-set', 'Story set', 'Social', [['Story 1', ...SOC], ['Story 2', ...SOC], ['Story 3', ...SOC]]),
    T('app-intro', 'App intro video', 'Social', ['Hook', 'The problem', 'The app in action', 'Features montage', 'Call to action', 'Palette & type'], { notes: { 'The app in action': 'Hearth can capture itself: drop recordings here' } }),
    T('launch', 'Product launch', 'Social', ['Teaser', 'Reveal', 'Details', 'Lifestyle', 'Launch day']),
    T('brand', 'Brand board', 'Design', ['Logo', 'Palette', 'Type', 'Imagery', 'Voice', 'Do / don\'t'], { notes: { Voice: 'Three words for how it should feel' } }),
    T('logo', 'Logo exploration', 'Design', ['Marks', 'Wordmarks', 'Colors', 'Contexts']),
    T('ui', 'UI look', 'Design', ['Screens', 'Components', 'Palette', 'Type', 'Motion', 'Icons']),
    T('typography', 'Type study', 'Design', ['Headlines', 'Body', 'Pairings', 'In motion']),
    T('poster', 'Poster', 'Design', [['Poster', 500, 700], 'Layout refs', 'Palette', 'Type']),
    T('editorial', 'Editorial spread', 'Design', [['Spread', 960, 600], 'Photos', 'Type', 'Grid']),
    T('packaging', 'Packaging', 'Design', ['Front', 'Back', 'Materials', 'Palette']),
    T('icon-set', 'Icon set', 'Design', ['Style refs', 'Grid & stroke', 'Set', 'In context']),
    T('film-look', 'Film look', 'Film', ['Grade', 'Grain & texture', 'Lenses', 'Light', 'Framing', 'Pacing']),
    T('storyboard-6', 'Storyboard · 6 panels', 'Film', ['1', '2', '3', '4', '5', '6'].map((n) => [`Shot ${n}`, 480, 270]), { cols: 3 }),
    T('storyboard-9', 'Storyboard · 9 panels', 'Film', ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => [`Shot ${n}`, 480, 270]), { cols: 3 }),
    T('storyboard-12', 'Storyboard · 12 panels', 'Film', Array.from({ length: 12 }, (_, i) => [`Shot ${i + 1}`, 400, 225]), { cols: 4 }),
    T('shot-list', 'Shot list', 'Film', ['Wide', 'Medium', 'Close-up', 'Insert', 'Movement', 'Transitions']),
    T('color-script', 'Color script', 'Film', ['Act 1', 'Act 2', 'Act 3', 'Climax', 'End'].map((t) => [t, 400, 240]), { cols: 5 }),
    T('lighting', 'Lighting study', 'Film', ['Key', 'Fill', 'Rim', 'Practicals', 'Night', 'Golden hour']),
    T('title-seq', 'Title sequence', 'Film', ['Opening', 'Names', 'Transitions', 'Type', 'Palette', 'Ending']),
    T('vfx', 'VFX look-dev', 'Film', ['Plates', 'Elements', 'Comp refs', 'Grade']),
    T('documentary', 'Documentary', 'Film', ['Interviews', 'B-roll', 'Archival', 'Graphics']),
    T('character', 'Character', '3D / games', ['Silhouette', 'Faces', 'Costume', 'Palette', 'Poses', 'Materials']),
    T('environment', 'Environment', '3D / games', ['Wide', 'Details', 'Light', 'Weather', 'Palette', 'Scale']),
    T('material', 'Material study', '3D / games', ['Metal', 'Glass', 'Fabric', 'Stone', 'Organic', 'Emissive']),
    T('three-scene', 'Three.js scene', '3D / games', ['Forms', 'Materials', 'Light & fog', 'Camera moves', 'Post effects', 'Palette'], { notes: { 'Post effects': 'Bloom, grain, chromatic aberration…' } }),
    T('shader', 'Shader look', '3D / games', ['Patterns', 'Noise', 'Color ramps', 'Motion']),
    T('game-level', 'Game level', '3D / games', ['Layout', 'Landmarks', 'Mood', 'Enemies', 'UI', 'Palette']),
    T('game-ui', 'Game UI', '3D / games', ['HUD', 'Menus', 'Icons', 'Fonts', 'Effects']),
    T('motion-study', 'Motion study', 'Motion', ['Easing', 'Timing', 'Loops', 'Transitions', 'Particles', 'Camera']),
    T('loops', 'Loop ideas', 'Motion', ['Seamless', 'Morphs', 'Patterns', 'Kinetic type']),
    T('transitions', 'Transitions', 'Motion', ['Cuts', 'Wipes', 'Morphs', 'Match cuts', 'Glitches']),
    T('kinetic-type', 'Kinetic type', 'Motion', ['Layouts', 'Rhythm', 'Fonts', 'Color']),
    T('fashion', 'Fashion', 'Lifestyle', ['Silhouettes', 'Fabrics', 'Palette', 'Styling', 'Locations']),
    T('interior', 'Interior', 'Lifestyle', ['Rooms', 'Materials', 'Light', 'Furniture', 'Palette']),
    T('architecture', 'Architecture', 'Lifestyle', ['Forms', 'Facades', 'Materials', 'Light', 'Context']),
    T('food', 'Food styling', 'Lifestyle', ['Plates', 'Props', 'Light', 'Palette']),
    T('travel', 'Travel', 'Lifestyle', ['Places', 'People', 'Light', 'Palette', 'Textures']),
    T('photo-series', 'Photo series', 'Photo', ['Subjects', 'Framing', 'Light', 'Grade', 'Sequence']),
    T('portrait', 'Portrait lighting', 'Photo', ['Soft', 'Hard', 'Color gels', 'Backgrounds']),
    T('street', 'Street photo', 'Photo', ['Moments', 'Geometry', 'Light & shadow', 'Night']),
    T('product-shot', 'Product shots', 'Photo', ['Hero', 'Details', 'Lifestyle', 'Backgrounds']),
    T('event', 'Event visuals', 'Events', ['Stage', 'Screens', 'Signage', 'Merch', 'Palette']),
    T('wedding', 'Celebration', 'Events', ['Venue', 'Flowers', 'Palette', 'Stationery', 'Light']),
    T('workshop', 'Workshop', 'Events', ['Goals', 'References', 'Ideas', 'Decisions'], { notes: { Decisions: 'What we keep' } }),
    T('pitch', 'Pitch deck look', 'Business', ['Cover', 'Story', 'Charts', 'Photos', 'Palette', 'Type']),
    T('competitors', 'Competitor scan', 'Business', ['Them', 'Us', 'Gaps', 'Steal like an artist']),
    T('portfolio', 'Portfolio', 'Business', ['Best work', 'Process', 'About', 'Layout refs']),
    T('website', 'Website look', 'Web', ['Hero sections', 'Navigation', 'Type', 'Palette', 'Motion', 'Footers']),
    T('landing', 'Landing page', 'Web', ['Hero', 'Features', 'Social proof', 'Pricing', 'Call to action']),
    T('newsletter', 'Newsletter', 'Web', ['Headers', 'Layouts', 'Type', 'Images']),
    T('dark-mode', 'Dark mode study', 'Web', ['Surfaces', 'Accents', 'Text', 'States']),
    T('palette-explore', 'Palette exploration', 'Color', ['Warm', 'Cool', 'Neon', 'Pastel', 'Earth', 'Mono']),
    T('gradients', 'Gradients', 'Color', ['Linear', 'Radial', 'Mesh', 'Grain']),
    T('neon-night', 'Neon night', 'Color', ['Signs', 'Rain', 'Reflections', 'Palette'], { color: '#ff2e88' }),
    T('golden-hour', 'Golden hour', 'Color', ['Skies', 'Skin', 'Shadows', 'Palette'], { color: '#f2a03d' }),
    T('forgeheart', 'Forgeheart look', 'Color', ['Gold', 'Molten', 'Chrome', 'Glass', 'Embers'], { color: '#e6b450' }),
  ];

  // ---------- lenses: look at the board through one part of its vibe ----------
  const LENS = (id, name, kind, desc, opts = {}) => ({ id, name, kind, desc, ...opts });
  const LENSES = [
    LENS('palette', 'Palette', 'palette', 'each item as its palette stripes'),
    LENS('dominant', 'Dominant color', 'dominant', 'each item as its strongest color'),
    LENS('blocks', 'Color blocks', 'blocks', 'flat blocks of each item\'s colors, sized by share'),
    LENS('light', 'Light', 'filter', 'black and white, contrast pushed: see the values', { filter: 'grayscale(1) contrast(1.35)' }),
    LENS('luma', 'Light zones', 'filter', 'shadows / mids / highlights in three steps', { filter: 'grayscale(1) contrast(4) brightness(1.05)' }),
    LENS('squint', 'Squint', 'filter', 'blurred: only the big shapes and values remain', { filter: 'blur(6px) saturate(1.2)' }),
    LENS('mono', 'Monochrome', 'filter', 'no color at all', { filter: 'grayscale(1)' }),
    LENS('vivid', 'Saturation boost', 'filter', 'colors pushed to see the hues', { filter: 'saturate(2.6)' }),
    LENS('invert', 'Negative', 'filter', 'inverted', { filter: 'invert(1) hue-rotate(180deg)' }),
    LENS('motion', 'Motion', 'heat', 'red = lots of motion, blue = calm; stills fade', { key: 'motion' }),
    LENS('pacing', 'Cut pacing', 'label', 'seconds per shot on every clip', { key: 'pacing' }),
    LENS('warmth', 'Warmth', 'heat', 'warm vs cool tint', { key: 'warmth' }),
    LENS('saturation', 'Saturation', 'heat', 'how colorful each item is', { key: 'sat' }),
    LENS('contrast', 'Contrast', 'heat', 'soft to punchy', { key: 'contrast' }),
    LENS('texture', 'Texture', 'heat', 'clean to busy (edge density)', { key: 'edges' }),
    LENS('brightness', 'Brightness', 'heat', 'dark to bright', { key: 'light' }),
    LENS('composition', 'Composition', 'compose', 'thirds grid and where the weight sits'),
    LENS('symmetry', 'Symmetry', 'label', 'how mirror-like each item is', { key: 'symmetry' }),
    LENS('space', 'Negative space', 'label', 'how much calm empty area', { key: 'space' }),
    LENS('mood', 'Mood words', 'label', 'the words Hearth reads in each item', { key: 'mood' }),
    LENS('type', 'Type', 'type', 'fonts of sites and text; pictures fade'),
    LENS('tags', 'Tags', 'label', 'your tags on every item', { key: 'tags' }),
    LENS('notes', 'Notes', 'label', 'your notes on every item', { key: 'note' }),
    LENS('aspect', 'Shape', 'label', 'aspect ratio of every item', { key: 'aspect' }),
    LENS('stamps', 'Stamped only', 'only', 'only items with a stamp', { test: 'stamp' }),
    LENS('videos', 'Clips only', 'only', 'only videos and gifs', { test: 'video' }),
    LENS('stills', 'Stills only', 'only', 'only pictures', { test: 'image' }),
    LENS('sites', 'Sites only', 'only', 'only website cards', { test: 'web' }),
    LENS('outline', 'Outlines', 'outline', 'boxes only: the board\'s own composition'),
    LENS('focus', 'Focus selection', 'focus', 'everything but the selection fades'),
  ];

  // ---------- item looks (CSS filters; the image export draws them too) ----------
  const F = (id, name, filter) => ({ id, name, filter });
  const FILTERS = [
    F('none', 'Original', ''),
    F('bw', 'Black & white', 'grayscale(1)'),
    F('bw-hard', 'Hard black & white', 'grayscale(1) contrast(1.6)'),
    F('bw-soft', 'Soft black & white', 'grayscale(1) contrast(0.85) brightness(1.08)'),
    F('noir', 'Noir', 'grayscale(1) contrast(1.9) brightness(0.8)'),
    F('sepia', 'Sepia', 'sepia(0.85)'),
    F('faded', 'Faded film', 'contrast(0.82) brightness(1.1) saturate(0.75) sepia(0.12)'),
    F('matte', 'Matte', 'contrast(0.88) brightness(1.06) saturate(0.9)'),
    F('warm', 'Warm', 'sepia(0.25) saturate(1.25) hue-rotate(-8deg)'),
    F('cool', 'Cool', 'saturate(1.1) hue-rotate(12deg) brightness(1.02)'),
    F('vivid', 'Vivid', 'saturate(1.7) contrast(1.1)'),
    F('punch', 'Punchy', 'contrast(1.35) saturate(1.3)'),
    F('muted', 'Muted', 'saturate(0.45)'),
    F('pastel', 'Pastel', 'saturate(0.6) brightness(1.18) contrast(0.88)'),
    F('bleach', 'Bleach bypass', 'saturate(0.35) contrast(1.5) brightness(0.95)'),
    F('cross', 'Cross-process', 'contrast(1.2) saturate(1.5) hue-rotate(-18deg) sepia(0.15)'),
    F('teal-orange', 'Teal & orange', 'sepia(0.3) saturate(1.6) hue-rotate(-12deg) contrast(1.1)'),
    F('cyber', 'Cyberpunk', 'hue-rotate(280deg) saturate(2.2) contrast(1.2)'),
    F('night', 'Day for night', 'brightness(0.55) saturate(0.7) hue-rotate(200deg) contrast(1.2)'),
    F('sunset', 'Sunset', 'sepia(0.5) saturate(1.7) hue-rotate(-24deg) brightness(1.04)'),
    F('dream', 'Dreamy', 'blur(1.2px) brightness(1.12) saturate(1.15) contrast(0.9)'),
    F('haze', 'Haze', 'contrast(0.7) brightness(1.18)'),
    F('dark', 'Darker', 'brightness(0.7)'),
    F('bright', 'Brighter', 'brightness(1.3)'),
    F('contrast-up', 'More contrast', 'contrast(1.4)'),
    F('contrast-down', 'Less contrast', 'contrast(0.7)'),
    F('blur', 'Soft blur', 'blur(3px)'),
    F('blur-heavy', 'Heavy blur', 'blur(10px)'),
    F('invert', 'Invert', 'invert(1)'),
    F('xray', 'X-ray', 'invert(1) grayscale(1) contrast(1.3)'),
    F('thermal', 'Thermal-ish', 'invert(1) hue-rotate(180deg) saturate(3) contrast(1.3)'),
    F('hue-90', 'Hue shift 90°', 'hue-rotate(90deg)'),
    F('hue-180', 'Hue shift 180°', 'hue-rotate(180deg)'),
    F('hue-270', 'Hue shift 270°', 'hue-rotate(270deg)'),
    F('lomo', 'Lomo', 'contrast(1.4) saturate(1.5) brightness(0.95)'),
    F('polaroid', 'Polaroid', 'sepia(0.2) contrast(0.95) brightness(1.1) saturate(1.2)'),
    F('kodak', 'Warm print', 'sepia(0.18) saturate(1.35) contrast(1.08) brightness(1.04)'),
    F('fuji', 'Green print', 'saturate(1.2) hue-rotate(8deg) contrast(1.05)'),
    F('chrome', 'Chrome', 'grayscale(0.6) contrast(1.6) brightness(1.1)'),
    F('gold', 'Gilded', 'sepia(1) saturate(2.4) hue-rotate(-6deg) brightness(1.05)'),
    F('neon', 'Neon', 'saturate(3) contrast(1.3) brightness(1.1)'),
    F('ghost', 'Ghost', 'opacity(0.55) grayscale(0.5) blur(0.6px)'),
    F('silhouette', 'Silhouette', 'brightness(0.2) contrast(3)'),
    F('posterize', 'Poster', 'contrast(2.4) saturate(1.6)'),
    F('washed', 'Washed out', 'brightness(1.25) contrast(0.75) saturate(0.8)'),
    F('moody', 'Moody', 'brightness(0.82) contrast(1.15) saturate(0.8)'),
  ];

  const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

  // ---------- notes ----------
  const N = (id, name, bg, fg = '#1d1b16', extra = {}) => ({ id, name, bg, fg, ...extra });
  const NOTE_STYLES = [
    N('lemon', 'Lemon', '#ffe68a'), N('peach', 'Peach', '#ffc8a8'), N('mint', 'Mint', '#b9f0cf'), N('sky', 'Sky', '#b8dcff'),
    N('lilac', 'Lilac', '#dccbff'), N('rose', 'Rose', '#ffc2d6'), N('paper', 'Paper', '#f6f1e7'), N('kraft', 'Kraft', '#d8b98c'),
    N('ink', 'Ink', '#1d2027', '#e9e6df'), N('slate', 'Slate', '#3a4150', '#eef1f6'), N('gold', 'Gold', '#e6b450'), N('ember', 'Ember', '#ff7a3d'),
    N('ice', 'Ice', '#dff6ff', '#0b2533'), N('neon-pink', 'Neon pink', '#ff2e88', '#fff'), N('neon-lime', 'Neon lime', '#c6ff3d'),
    N('blueprint', 'Blueprint', '#1f4fa8', '#e8f0ff', { font: 'ui-monospace, Consolas, monospace' }),
    N('chalk', 'Chalkboard', '#26302b', '#f0f0e8', { font: '"Segoe Print", "Bradley Hand", cursive' }),
    N('glass', 'Glass', 'rgba(255,255,255,0.14)', 'inherit', { border: true }),
    N('forge', 'Forge', '#16120c', '#e6b450', { border: true }),
    N('index', 'Index card', '#ffffff', '#24324a', { lines: true }),
  ];

  // ---------- text styles (headline items) ----------
  const TX = (id, name, css) => ({ id, name, css });
  const TEXT_STYLES = [
    TX('clean', 'Clean sans', { fontFamily: 'system-ui, "Segoe UI", Helvetica, sans-serif', fontWeight: 600 }),
    TX('bold', 'Heavy', { fontFamily: '"Arial Black", "Helvetica Neue", Impact, sans-serif', fontWeight: 900 }),
    TX('impact', 'Poster', { fontFamily: 'Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif', textTransform: 'uppercase', letterSpacing: '0.02em' }),
    TX('wide', 'Wide caps', { fontFamily: 'system-ui, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.35em' }),
    TX('thin', 'Thin', { fontFamily: '"Helvetica Neue", "Segoe UI Light", system-ui, sans-serif', fontWeight: 200 }),
    TX('serif', 'Serif', { fontFamily: 'Georgia, "Times New Roman", serif' }),
    TX('serif-italic', 'Serif italic', { fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }),
    TX('didone', 'Fashion serif', { fontFamily: '"Didot", "Bodoni MT", "Bodoni 72", Georgia, serif', fontWeight: 700, letterSpacing: '0.04em' }),
    TX('garamond', 'Book', { fontFamily: 'Garamond, "EB Garamond", Palatino, serif' }),
    TX('mono', 'Mono', { fontFamily: 'ui-monospace, Consolas, "SF Mono", monospace' }),
    TX('terminal', 'Terminal', { fontFamily: 'ui-monospace, Consolas, monospace', color: '#4dff88', textShadow: '0 0 8px #4dff8899' }),
    TX('typewriter', 'Typewriter', { fontFamily: '"Courier New", Courier, monospace' }),
    TX('hand', 'Handwritten', { fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' }),
    TX('script', 'Script', { fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive', fontSize: '1.2em' }),
    TX('condensed', 'Condensed', { fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif', fontWeight: 700, letterSpacing: '-0.01em' }),
    TX('rounded', 'Rounded', { fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif', fontWeight: 700 }),
    TX('oxanium', 'Forgeheart', { fontFamily: 'Oxanium, system-ui, sans-serif', fontWeight: 700, textTransform: 'uppercase', color: '#e6b450' }),
    TX('neon', 'Neon glow', { fontFamily: 'system-ui, sans-serif', fontWeight: 700, color: '#ff4fd8', textShadow: '0 0 6px #ff4fd8, 0 0 22px #ff4fd8aa' }),
    TX('outline', 'Outline', { fontFamily: '"Arial Black", Impact, sans-serif', color: 'transparent', WebkitTextStroke: '2px currentColor', fontWeight: 900 }),
    TX('chrome', 'Chrome', { fontFamily: '"Arial Black", Impact, sans-serif', fontWeight: 900, backgroundImage: 'linear-gradient(180deg,#fff 0%,#9aa3ad 48%,#3b4048 52%,#d7dde3 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
    TX('gold', 'Gold leaf', { fontFamily: 'Georgia, serif', fontWeight: 700, backgroundImage: 'linear-gradient(180deg,#fff2b0,#e6b450 45%,#8a5a12 55%,#ffd76a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
    TX('gradient', 'Sunset gradient', { fontFamily: 'system-ui, sans-serif', fontWeight: 800, backgroundImage: 'linear-gradient(90deg,#ff5f6d,#ffc371)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
    TX('ice', 'Ice gradient', { fontFamily: 'system-ui, sans-serif', fontWeight: 800, backgroundImage: 'linear-gradient(90deg,#9be7ff,#5b7cfa)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }),
    TX('shadow', 'Drop shadow', { fontFamily: 'system-ui, sans-serif', fontWeight: 800, textShadow: '4px 4px 0 #0008' }),
    TX('retro', 'Retro offset', { fontFamily: '"Arial Black", Impact, sans-serif', fontWeight: 900, color: '#ffd23f', textShadow: '3px 3px 0 #ee4266, 6px 6px 0 #3bceac' }),
    TX('glitch', 'Glitch', { fontFamily: 'system-ui, sans-serif', fontWeight: 800, textShadow: '-2px 0 #ff004c, 2px 0 #00e5ff' }),
    TX('stencil', 'Stencil', { fontFamily: '"Stencil", "Stencil Std", Impact, sans-serif', textTransform: 'uppercase' }),
    TX('small-caps', 'Small caps', { fontFamily: 'Georgia, serif', fontVariant: 'small-caps', letterSpacing: '0.08em' }),
    TX('label', 'Label', { fontFamily: 'system-ui, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.5em', opacity: '0.75' }),
    TX('quote', 'Quote', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, opacity: '0.92' }),
  ];

  // ---------- canvas backgrounds ----------
  const BG = (id, name, color, pattern, ink) => ({ id, name, color, pattern, ink });
  const BACKGROUNDS = [
    BG('theme', 'Follow the app look', null, 'dots', null),
    BG('dots', 'Dots', '#121418', 'dots', '#ffffff22'), BG('grid', 'Grid', '#121418', 'grid', '#ffffff14'), BG('lines', 'Lined', '#121418', 'lines', '#ffffff12'),
    BG('blank-dark', 'Plain dark', '#101114', 'none', null), BG('black', 'Black', '#000000', 'none', null), BG('charcoal', 'Charcoal', '#1e1f22', 'dots', '#ffffff18'),
    BG('blank-light', 'Plain light', '#f3f1ec', 'none', null), BG('paper', 'Paper', '#f4efe4', 'dots', '#00000022'), BG('white', 'White', '#ffffff', 'none', null),
    BG('graph', 'Graph paper', '#f6f8fb', 'grid', '#2b6cb022'), BG('blueprint', 'Blueprint', '#173c7a', 'grid', '#ffffff26'), BG('cross', 'Crosses', '#121418', 'cross', '#ffffff26'),
    BG('studio-gray', 'Studio gray', '#5b5e63', 'none', null), BG('mid-gray', '18% gray', '#777777', 'none', null), BG('warm-dark', 'Warm dark', '#1b1511', 'dots', '#e6b45022'),
    BG('forge', 'Forge', '#120e09', 'grid', '#e6b4501c'), BG('night', 'Night blue', '#0b1020', 'dots', '#8fb4ff22'), BG('plum', 'Plum', '#1c1020', 'dots', '#ff8fe522'),
    BG('olive', 'Olive', '#1a1c12', 'lines', '#d6e6a01a'), BG('sand', 'Sand', '#e8dcc4', 'dots', '#5a432222'), BG('mint', 'Mint', '#e3f4ec', 'grid', '#1c6b4a1c'),
    BG('cork', 'Cork', '#b98d5a', 'dots', '#4a2f1433'), BG('felt', 'Green felt', '#1f4a35', 'none', null),
  ];

  // ---------- frames ----------
  const FS = (id, name, w, h) => ({ id, name, w, h });
  const FRAME_SIZES = [
    FS('story', '9:16 story / reel', 540, 960), FS('portrait45', '4:5 feed', 540, 675), FS('square', '1:1 square', 600, 600), FS('wide', '16:9 video', 960, 540),
    FS('scope', '2.39:1 cinema', 1035, 433), FS('flat', '1.85:1 film', 999, 540), FS('academy', '4:3', 720, 540), FS('photo32', '3:2 photo', 810, 540),
    FS('photo23', '2:3 photo', 540, 810), FS('a4', 'A4 portrait', 595, 842), FS('a4l', 'A4 landscape', 842, 595), FS('letter', 'US Letter', 612, 792),
    FS('poster', 'Poster 2:3', 600, 900), FS('banner', 'Banner 3:1', 1200, 400), FS('yt-thumb', 'YouTube thumbnail', 640, 360), FS('x-header', 'X header 3:1', 1500, 500),
    FS('slide', 'Slide 16:9', 1280, 720), FS('phone', 'Phone screen', 393, 852), FS('tablet', 'Tablet', 820, 1180), FS('desktop', 'Desktop screen', 1440, 900),
    FS('album', 'Album cover', 600, 600), FS('vinyl', 'Vinyl sleeve', 620, 620), FS('ultrawide', '21:9', 1260, 540), FS('vertical-45', '4:5 tall', 480, 600),
    FS('pano', 'Panorama 4:1', 1600, 400), FS('card', 'Business card', 525, 300), FS('sticky', 'Sticky size', 300, 300), FS('column', 'Tall column', 520, 1400),
    FS('section', 'Big section', 1600, 1000), FS('huge', 'Huge area', 3000, 2000),
  ];
  const FRAME_COLORS = [
    ['Neutral', null], ['Gold', '#e6b450'], ['Ember', '#ff7a3d'], ['Red', '#ff5a5a'], ['Pink', '#ff4fa3'], ['Violet', '#9b7bff'], ['Blue', '#4f8cff'],
    ['Cyan', '#36d6e7'], ['Green', '#3bd16f'], ['Lime', '#b6e83f'], ['Sand', '#d8c39a'], ['Slate', '#7d8899'], ['White', '#ffffff'], ['Black', '#000000'],
  ];

  // ---------- crops ----------
  const CROPS = [
    ['Free (reset)', null], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['3:4', 3 / 4], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 3 / 2],
    ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9], ['2.39:1', 2.39], ['1.85:1', 1.85], ['3:1 banner', 3],
  ];

  // ---------- color helpers (pure) ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const hslHex = (h, s, l) => rgbToHex(...hslToRgb(h, clamp(s), clamp(l)));
  const hexHsl = (hex) => rgbToHsl(...hexToRgb(hex));
  // A plain name for a color ("deep teal", "pale pink") for chats and search.
  const FAMILIES = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [195, 'teal'], [250, 'blue'], [290, 'violet'], [335, 'pink'], [361, 'red']];
  function family(hex) {
    const [h, s, l] = hexHsl(hex);
    if (l < 0.1) return 'black';
    if (l > 0.93) return 'white';
    if (s < 0.14) return 'gray';
    if (h >= 15 && h < 45 && l < 0.42) return 'brown';
    return FAMILIES.find(([lim]) => h < lim)[1];
  }
  function colorName(hex) {
    const [, s, l] = hexHsl(hex);
    const fam = family(hex);
    if (['black', 'white'].includes(fam)) return fam;
    const tone = l < 0.22 ? 'deep ' : l < 0.38 ? 'dark ' : l > 0.8 ? 'pale ' : l > 0.65 ? 'light ' : '';
    const sat = fam === 'gray' ? '' : s < 0.3 ? 'dusty ' : s > 0.8 && l > 0.35 && l < 0.7 ? 'vivid ' : '';
    return `${tone}${sat}${fam}`.trim();
  }

  // ---------- palettes from one color ----------
  const H = (id, name, fn) => ({ id, name, fn });
  const HARMONIES = [
    H('complementary', 'Complementary', (h, s, l) => [[h, s, l], [h + 180, s, l], [h, s * 0.5, Math.min(0.92, l + 0.3)], [h + 180, s * 0.6, l * 0.55], [h, s * 0.2, 0.12]]),
    H('analogous', 'Analogous', (h, s, l) => [-40, -20, 0, 20, 40].map((d) => [h + d, s, l])),
    H('triadic', 'Triadic', (h, s, l) => [[h, s, l], [h + 120, s, l], [h + 240, s, l], [h, s * 0.3, 0.9], [h, s * 0.3, 0.12]]),
    H('split', 'Split complementary', (h, s, l) => [[h, s, l], [h + 150, s, l], [h + 210, s, l], [h, s * 0.4, 0.88], [h + 180, s * 0.3, 0.15]]),
    H('tetradic', 'Tetradic', (h, s, l) => [0, 60, 180, 240].map((d) => [h + d, s, l]).concat([[h, 0.1, 0.1]])),
    H('square', 'Square', (h, s, l) => [0, 90, 180, 270].map((d) => [h + d, s, l]).concat([[h, 0.1, 0.92]])),
    H('mono', 'Monochrome', (h, s, l) => [0.15, 0.32, 0.5, 0.68, 0.86].map((x) => [h, s, x])),
    H('shades', 'Shades', (h, s, l) => [1, 0.8, 0.6, 0.4, 0.22].map((k) => [h, s, l * k])),
    H('tints', 'Tints', (h, s, l) => [0, 0.2, 0.4, 0.6, 0.8].map((k) => [h, s, l + (1 - l) * k])),
    H('tones', 'Tones', (h, s, l) => [1, 0.75, 0.5, 0.3, 0.12].map((k) => [h, s * k, l])),
    H('warm', 'Warmer steps', (h, s, l) => [0, -12, -24, -36, -48].map((d) => [h + d, Math.min(1, s * 1.1), l])),
    H('cool', 'Cooler steps', (h, s, l) => [0, 14, 28, 42, 56].map((d) => [h + d, s, l])),
    H('neutral', 'Color + neutrals', (h, s, l) => [[h, s, l], [h, 0.06, 0.95], [h, 0.05, 0.7], [h, 0.06, 0.35], [h, 0.08, 0.08]]),
    H('accent', 'Dark + accent', (h, s, l) => [[h, 0.25, 0.08], [h, 0.2, 0.16], [h, 0.15, 0.3], [h, Math.max(0.7, s), 0.55], [h + 180, 0.8, 0.6]]),
  ];
  const harmony = (id, hex) => { const hm = HARMONIES.find((x) => x.id === id) || HARMONIES[0]; const [h, s, l] = hexHsl(hex); return hm.fn(h, s, l).map(([a, b, c]) => hslHex(a, b, c)); };

  // ---------- curated palettes (add one as a swatch card, or send it to a chat) ----------
  const P = (name, colors, tags = '') => ({ name, colors: colors.split(' ').map((c) => `#${c}`), tags });
  const PALETTES = [
    P('Neon noir', '0b0f1a 1b1f3a ff2e88 2de2e6 f6f5ae', 'night neon cyber'), P('Teal & orange', '0f3d3e 1f7a7a e3e3d3 f29e4c d1495b', 'film blockbuster'),
    P('Golden hour', '2d1e2f 7c3a2d e07a3f f2b880 fff1d6', 'warm sunset'), P('Blue hour', '0d1b2a 1b263b 415a77 778da9 e0e1dd', 'cool dusk'),
    P('Forgeheart', '120e09 3a2a12 e6b450 ff7a3d fff1c1', 'gold molten'), P('Pastel dream', 'ffd6e0 ffefcf d4f0f0 cfe1ff e2d4ff', 'soft pastel'),
    P('Vaporwave', 'ff71ce 01cdfe 05ffa1 b967ff fffb96', 'retro 80s'), P('Synthwave', '2b0f54 ab1f65 ff4f69 ff8031 ffdf6c', 'retro 80s'),
    P('Matrix', '000000 003b00 008f11 00ff41 d0ffd8', 'code green'), P('Bauhaus', 'f2f2f2 1c1c1c d62828 f7b801 1d3557', 'design primary'),
    P('Swiss', 'ffffff 111111 ff0000 e5e5e5 777777', 'design minimal'), P('Memphis', 'ff6f91 ffc75f f9f871 00c9a7 845ec2', 'playful 80s'),
    P('Desert', 'f2cc8f e07a5f 81b29a 3d405b f4f1de', 'earth'), P('Forest floor', '1b2a1f 2f4f3a 6b8f5e c9b37e 8a5a3b', 'earth green'),
    P('Ocean deep', '03045e 0077b6 00b4d8 90e0ef caf0f8', 'blue water'), P('Coral reef', 'ff6b6b ffa36c ffd93d 6bcb77 4d96ff', 'bright'),
    P('Moss & stone', '3b3c36 5e6052 8a8c74 b9b8a3 e4e2d6', 'muted earth'), P('Rust belt', '2b2b2b 5a3e36 a44a3f d9a066 eadcc4', 'industrial'),
    P('Chrome', '0e0f11 3b4048 9aa3ad d7dde3 ffffff', 'metal'), P('Ice', 'e8f8ff b8e6f5 7cc6e6 3c8dbc 0b3c5d', 'cold'),
    P('Lava', '1a0000 5c0a0a b3200e ff6b1a ffc23d', 'hot'), P('Cherry blossom', 'fff5f7 ffd1dc ff9eb5 c9637e 5a2a3a', 'spring pink'),
    P('Mint chip', 'e9fff5 b4f5d6 6fd3a6 2a7a5f 3b2a20', 'fresh'), P('Lavender fields', 'f3eefe d7c8f5 a68ae0 6a4fb0 2e2350', 'violet'),
    P('Noir', '000000 1c1c1c 3a3a3a 8c8c8c f0f0f0', 'black white'), P('Sepia print', '2e2215 5c4630 a58a62 d9c4a1 f5ecd9', 'vintage'),
    P('Kodachrome', '1e2a3a c0392b e9b44c 4f8a8b f2e8cf', 'film vintage'), P('Polaroid', 'f7f3e9 e9d8a6 94a89a 5e7c88 2f3e46', 'film'),
    P('Wes pastel', 'f1bb7b fd6467 5b1a18 d67236 e6d8c3', 'film symmetric'), P('Tokyo night', '1a1b26 24283b 7aa2f7 bb9af7 f7768e', 'night city'),
    P('Miami', '00c2c7 ff8bd8 ffd166 06d6a0 f8f9fa', 'bright'), P('Nordic', '2e3440 3b4252 88c0d0 a3be8c eceff4', 'cool calm'),
    P('Autumn', '3d1f12 8c2f1b d9631e f2a541 f2d7a0', 'warm fall'), P('Winter', 'f8fbff cfe0f0 8fb3d1 4a6d8c 1d2f40', 'cold'),
    P('Spring', 'fffbe6 d8f3dc 95d5b2 ffcad4 f4acb7', 'fresh'), P('Summer', 'ffbe0b fb5607 ff006e 8338ec 3a86ff', 'bright vivid'),
    P('Muted editorial', 'efeae2 c8bfb0 8e8576 4a4640 1f1d1a', 'calm'), P('Clay', 'e9d5c3 d4a373 b5784f 7f5539 3a2618', 'earth warm'),
    P('Olive drab', '2f3220 4b5320 7d8452 b9b27e e8e2c4', 'military earth'), P('Midnight gold', '0b0c10 1f2833 c5a35a f2d58c ffffff', 'luxury'),
    P('Royal', '14123b 2e2a72 5d4ab8 c9a227 f4ecd6', 'luxury'), P('Candy', 'ff5d8f ff97b7 ffd1e3 a0e7e5 b4f8c8', 'sweet'),
    P('Acid', '0d0d0d c6ff3d 2dfcff ff3df2 ffffff', 'rave'), P('Rave UV', '120024 4b0082 9d00ff ff00e6 00ffd5', 'rave night'),
    P('Bioluminescent', '00060f 00243a 00a6a6 66ffe3 c9fff7', 'deep sea glow'), P('Aurora', '0b132b 1c2541 3a506b 5bc0be 6fffe9', 'night glow'),
    P('Sakura neon', '1b0b1f ff4fa3 ffb3d9 7af0ff 2a1a3f', 'night pink'), P('Gameboy', '0f380f 306230 8bac0f 9bbc0f cadc9f', 'retro game'),
    P('CGA', '000000 55ffff ff55ff ffffff aa00aa', 'retro computer'), P('Blueprint', '0b2b5c 1f4fa8 5a8de0 b8d0ff ffffff', 'technical'),
    P('Terracotta', 'f4e1d2 e2a37f c86b4a 8f3f2a 3b1e14', 'earth warm'), P('Sage', 'f1f3ec cbd5c0 9aae8f 627a5c 2f3d2c', 'calm green'),
    P('Dusty rose', 'f7ebe8 e6c1bd c98f8f 8f5b5f 3f2a2d', 'soft'), P('Steel blue', 'e7edf3 b6c6d6 7d97b0 4b6584 25364a', 'cool calm'),
    P('Sunflower', 'fff8dc ffe066 f4a259 5b8e7d 244f26', 'warm'), P('Grape soda', '2b0f3a 5d1e7a 9b4dca d6a2e8 ffe5f9', 'violet'),
    P('Highlighter', 'faff00 00ff85 00e0ff ff2fa0 111111', 'loud'), P('Concrete', 'd9d9d6 b0b0ac 85857f 595955 2e2e2b', 'gray urban'),
    P('Film noir red', '0a0a0a 2b2b2b 9e1b1b e0e0e0 ffffff', 'black red'), P('Jungle', '0b2016 1e4d2b 3f7d3c 9ccc65 f2e94e', 'green lush'),
    P('Coffee', 'f5ebe0 d5bdaf a98467 6f4e37 2b1d14', 'brown warm'), P('Berry', '3b0a1e 7a1c3c c2185b f06292 fce4ec', 'red pink'),
    P('Arctic neon', '001219 005f73 0a9396 94d2bd e9d8a6', 'cool'), P('Sunrise', 'fbd3e9 bb377d f6a14b fde29b fff6e5', 'warm soft'),
    P('Tropical', '006d77 83c5be edf6f9 ffddd2 e29578', 'fresh'), P('Moody teal', '0f1f24 173a40 2c6e6f a3c4bc e8e1d4', 'calm dark'),
    P('Peach fuzz', 'fff1e6 ffd6ba ffbe98 e8956b 7d4e3a', 'soft warm'), P('Lilac haze', 'f5f0ff ddd0f7 bca5e8 8f78c4 4d3f73', 'soft violet'),
    P('Emerald city', '04211a 0b4f3c 13856a 3bd1a0 c8fff0', 'green glow'), P('Ruby', '1a0006 4d0011 8f0020 d1003a ff8aa0', 'red deep'),
    P('Sapphire', '00081a 001a4d 003399 3d6eff a8c0ff', 'blue deep'), P('Amber', '1a0e00 4d2b00 a35c00 f29f05 ffd98a', 'warm glow'),
    P('Oyster', 'f7f5f0 e8e3d9 cfc7b8 a69f92 6d675e', 'neutral'), P('Graphite', '111214 1e2024 2c2f35 4a4e57 9aa0aa', 'dark ui'),
    P('Paper & ink', 'f6f1e7 e5dccb 1f2a44 3c4f76 b23a48', 'editorial'), P('Risograph', 'ff48b0 0078bf ffe800 00a95c f6f1e7', 'print'),
    P('Halftone', 'f2efe9 2a2a2a e63946 457b9d f1faee', 'print comic'), P('Comic', 'ffde00 ff0000 0047ab 000000 ffffff', 'pop'),
    P('Pop art', 'ff1f8e ffe600 00b3ff 00d26a 1a1a1a', 'pop'), P('Ukiyo-e', 'f2e8cf 6a994e 386641 bc4749 1d3557', 'print classic'),
    P('Renaissance', '2b1d0e 6b4423 a67b5b d9c3a5 3d5a6c', 'classic paint'), P('Impressionist', 'a8d5e2 f9d56e f3a683 b8de6f 5c6bc0', 'paint soft'),
    P('Rothko', '3d0c11 7a1e1e c0392b e67e22 f4d03f', 'paint warm'), P('Klein blue', '002fa7 0b3fd1 4f6dd9 e8ecf8 111111', 'art blue'),
    P('Mondrian', 'ffffff dd0100 fac901 225095 000000', 'art primary'), P('Hokusai wave', 'e6e2d3 b8c5c9 4f7c8a 1f3c58 0b1a2b', 'blue classic'),
    P('Matcha', 'f3f5e9 d1dfb7 9cb87a 5f7a42 2e3a1f', 'green calm'), P('Chai', 'faf3e8 e6cfa9 c79a63 8c5a2b 3d2410', 'warm brown'),
    P('Smoky quartz', 'ece6e1 c7bcb4 8f817a 5b4f4a 2b2422', 'neutral warm'), P('Lunar', '0a0a0f 1c1c26 4a4a5a 9a9aad e8e8f0', 'gray cool'),
    P('Solar flare', '1a0500 6b1d00 e8590c ffa94d fff3bf', 'hot'), P('Glacier', 'f0fbff d0f0fa 9fd8ea 5aa9c8 1f5f7a', 'cold blue'),
    P('Volcanic', '0d0d0d 2b2b2b 6b0f0f d63b0f ffb703', 'hot dark'), P('Tidepool', '0b3d3a 1e6f68 61a89c f2d0a4 e86f4a', 'sea'),
    P('Meadow', 'eef7e1 c4e3a5 8fc56b 4f8a3a f6e27a', 'green fresh'), P('Bubblegum', 'ffe3f1 ffb3d9 ff7ab8 c75cff 6ad1ff', 'sweet'),
    P('Lofi', '2d2a32 4a4458 8e7dbe f2c6de faf3dd', 'calm night'), P('Chillhop', '1f2937 3b4a5c d4a373 e9c46a f4f1de', 'calm'),
    P('Drum & bass', '050505 1a1a1a 00ff9c 00b3ff ff0055', 'rave'), P('Techno', '000000 141414 2e2e2e ff0000 ffffff', 'dark minimal'),
    P('House', '0d0221 261447 6c3baa f75590 fce38a', 'night club'), P('Ambient', 'eef2f3 cfd9df a3b8c8 7090a8 3d5a73', 'calm'),
    P('Hip-hop gold', '0a0a0a 2b2b2b c9a227 f2d16b ffffff', 'luxury'), P('Indie film', 'ece4d4 c8b79a 7f8c74 4b5b55 2a2f2d', 'muted'),
    P('Horror', '050505 1a0a0a 4a0000 8b0000 d9d9d9', 'dark red'), P('Sci-fi lab', '0a0f14 12202b 1e90ff 00e5ff f0f8ff', 'cool tech'),
    P('Fantasy', '1b1033 3c2a6b 7d5ba6 e0b04c f6e7c1', 'magic gold'), P('Steampunk', '1e1611 4a3423 8c6239 c9a227 e8d8b0', 'brass'),
    P('Cyber yellow', '0d0d0d ffd300 ff006e 00f5d4 f1f1f1', 'cyber'), P('Holo foil', 'c9f0ff ffc9f5 fff7c9 c9ffd9 e0c9ff', 'iridescent'),
    P('Opal', 'f7f7ff dfe7fd cde5f7 f5d9ec e8f6ef', 'soft pearl'), P('Obsidian', '050608 0e1116 1b2029 2e3746 5c6b80', 'dark'),
  ];

  // ---------- what part of a vibe a chat gets (/board-use <focus>, "Send vibe ›") ----------
  const FO = (id, name, keys, lead) => ({ id, name, keys, lead });
  const FOCUS = [
    FO('full', 'Full vibe', ['palette', 'light', 'color', 'texture', 'motion', 'compose', 'type', 'mood', 'notes'], 'Use these references for their vibe'),
    FO('palette', 'Palette only', ['palette'], 'Take only the colors from these references'),
    FO('light', 'Light only', ['light'], 'Match the lighting (key, contrast) of these references'),
    FO('color', 'Color feel', ['palette', 'color'], 'Match the color feel (palette, saturation, warmth)'),
    FO('motion', 'Motion only', ['motion'], 'Match the motion energy and cut pacing of these references'),
    FO('pacing', 'Pacing only', ['motion'], 'Cut on this pacing'),
    FO('texture', 'Texture only', ['texture'], 'Match the texture and grain'),
    FO('composition', 'Composition only', ['compose'], 'Compose like these references'),
    FO('type', 'Type only', ['type'], 'Match the typography feel'),
    FO('mood', 'Mood words', ['mood', 'notes'], 'Aim for this mood'),
    FO('notes', 'My notes only', ['notes'], 'My notes on the references'),
    FO('opposite', 'The opposite', ['palette', 'light', 'motion', 'mood'], 'Do the OPPOSITE of these references (contrast them on purpose)'),
    FO('avoid', 'Things to avoid', ['palette', 'light', 'motion', 'mood', 'notes'], 'AVOID looking like these references'),
    FO('blend', 'Blend them', ['palette', 'light', 'color', 'motion', 'mood'], 'Blend these references into one look'),
    FO('lab', 'For a Lab scene', ['palette', 'light', 'motion', 'texture', 'mood'], 'Build the scene with this vibe (colors, light, motion, texture), not the footage'),
    FO('edit', 'For an edit', ['motion', 'light', 'palette', 'mood'], 'Edit with this rhythm and look'),
  ];

  // ---------- presentation (fly between frames) ----------
  const TR = (id, name, ms, easing, kind = 'fly') => ({ id, name, ms, easing, kind });
  const TRANSITIONS = [
    TR('fly', 'Fly', 900, 'cubic-bezier(.6,0,.2,1)'), TR('fly-slow', 'Slow fly', 1800, 'cubic-bezier(.45,0,.2,1)'), TR('whip', 'Whip', 380, 'cubic-bezier(.8,0,.2,1)'),
    TR('bounce', 'Bounce', 900, 'cubic-bezier(.3,1.4,.5,1)'), TR('cut', 'Cut', 0, 'linear', 'cut'), TR('fade', 'Fade through black', 700, 'ease', 'fade'),
    TR('zoom-out', 'Zoom out, then in', 1300, 'ease-in-out', 'arc'), TR('dolly', 'Dolly (scale only)', 900, 'ease-in-out', 'dolly'), TR('drift', 'Drift', 2600, 'ease-in-out'),
    TR('spin', 'Spin', 1000, 'cubic-bezier(.6,0,.2,1)', 'spin'), TR('snap', 'Snap', 220, 'cubic-bezier(.9,0,.1,1)'), TR('glide', 'Glide (linear)', 1200, 'linear'),
  ];

  // ---------- exports ----------
  const EXPORTS = [
    ['png', 'Board as PNG'], ['png2', 'Board as PNG at 2×'], ['jpg', 'Board as JPEG (smaller)'], ['sel', 'Selection as PNG'], ['frames', 'Each frame as a PNG'],
    ['pages', 'Pages (frames stacked, PDF-like image)'], ['contact', 'Contact sheet of the media'], ['palette-png', 'Board palette as a PNG strip'],
    ['palette-css', 'Board palette as CSS variables'], ['palette-json', 'Board palette as JSON'], ['palette-gpl', 'Board palette for GIMP / Krita (.gpl)'],
    ['md', 'Vibe brief as Markdown'], ['vibe-json', 'Vibe data as JSON'], ['csv', 'Item list as CSV'], ['zip', 'Whole board as a .zip (data + media)'], ['clip', 'Copy the vibe text'],
  ];

  // ---------- stamps (a small mark on an item; "Columns by stamp", the Stamped lens) ----------
  const STAMPS = [
    ['★', 'Favorite'], ['♥', 'Love it'], ['✓', 'Approved'], ['✕', 'Not this'], ['?', 'Question'], ['!', 'Important'],
    ['☀', 'Light reference'], ['♪', 'Music feel'], ['⚡', 'Energy'], ['◐', 'Contrast'], ['◆', 'Color reference'], ['Aa', 'Type reference'],
  ];

  // ---------- mood words from a vibe (rules; first matches lead) ----------
  // v: { light, contrast, sat, warmth, edges, motion, pace, colorful, space, symmetry }
  const MOODS = [
    [(v) => v.light < 0.25 && v.warmth < 0, ['nocturnal', 'cold']], [(v) => v.light < 0.25 && v.warmth >= 0, ['smoky', 'intimate']],
    [(v) => v.light < 0.35 && v.contrast > 0.55, ['dramatic', 'chiaroscuro']], [(v) => v.light > 0.72 && v.contrast < 0.35, ['airy', 'soft']],
    [(v) => v.light > 0.7 && v.sat > 0.5, ['sunny', 'playful']], [(v) => v.sat > 0.62 && v.contrast > 0.5, ['electric', 'loud']],
    [(v) => v.sat < 0.18, ['restrained', 'monochrome']], [(v) => v.sat < 0.35 && v.warmth > 0.1, ['vintage', 'nostalgic']],
    [(v) => v.warmth > 0.25, ['warm']], [(v) => v.warmth < -0.2, ['cool', 'clinical']], [(v) => v.edges > 0.5, ['gritty', 'busy']],
    [(v) => v.edges < 0.12, ['clean', 'minimal']], [(v) => v.space > 0.55, ['spacious', 'calm']], [(v) => v.symmetry > 0.82, ['symmetric', 'formal']],
    [(v) => v.motion > 0.6, ['frantic', 'energetic']], [(v) => v.motion > 0.3 && v.motion <= 0.6, ['lively']], [(v) => v.motion != null && v.motion < 0.12, ['still', 'meditative']],
    [(v) => v.pace != null && v.pace < 0.8, ['rapid-fire cuts']], [(v) => v.pace != null && v.pace > 4, ['long takes']], [(v) => v.colorful > 0.55, ['colorful']],
  ];

  // Background patterns as CSS (a cell of `size` px)
  function patternCss(bg, size = 24) {
    if (!bg || !bg.pattern || bg.pattern === 'none' || !bg.ink) return 'none';
    const ink = bg.ink;
    if (bg.pattern === 'dots') return `radial-gradient(circle at 1px 1px, ${ink} 1.2px, transparent 1.6px) 0 0 / ${size}px ${size}px`;
    if (bg.pattern === 'grid') return `linear-gradient(${ink} 1px, transparent 1px) 0 0 / ${size}px ${size}px, linear-gradient(90deg, ${ink} 1px, transparent 1px) 0 0 / ${size}px ${size}px`;
    if (bg.pattern === 'lines') return `linear-gradient(${ink} 1px, transparent 1px) 0 0 / ${size}px ${size}px`;
    if (bg.pattern === 'cross') return `linear-gradient(${ink} 1px, transparent 1px) ${size / 2 - 3}px ${size / 2}px / ${size}px ${size}px, linear-gradient(90deg, ${ink} 1px, transparent 1px) ${size / 2}px ${size / 2 - 3}px / ${size}px ${size}px`;
    return 'none';
  }

  const find = (list, q) => { const s = String(q || '').toLowerCase().trim(); return list.find((x) => (x.id || '').toLowerCase() === s) || list.find((x) => (x.name || '').toLowerCase() === s) || list.find((x) => `${x.id} ${x.name}`.toLowerCase().includes(s)) || null; };

  const api = {
    LAYOUTS, TEMPLATES, LENSES, FILTERS, BLENDS, NOTE_STYLES, TEXT_STYLES, BACKGROUNDS, FRAME_SIZES, FRAME_COLORS, CROPS, HARMONIES, PALETTES, FOCUS, TRANSITIONS, EXPORTS, STAMPS, MOODS,
    hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hslHex, hexHsl, family, colorName, harmony, patternCss, find, clamp,
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
