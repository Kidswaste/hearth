// Video projects (round 8, "intro"): the data and the pure planning math behind /intro. A video project is the
// owner's real job end to end — a motion-design video for socials made with the chats: a plan of beats, the mood
// board's vibe, Lab scenes Claude and Astra jam on, Hearth filmed by capture tours, an edit in the video editor,
// a frame-exact review and renders in every format. intro.js runs it; this file is what it runs on.
// No DOM here: it loads in Node for tests (node dev/intro-test.js).
//   IntroData.makePlan({ template, secs, formats, name, vibe, counts }) → plan { beats, style, … }
//   IntroData.fitToMusic(beats, analysis, mode) → beats with secs on the bars / beats / the drop
//   IntroData.cutDown(plan, secs) → a shorter plan (the 15 s / 6 s cut), kept beats by priority
//   IntroData.tourText(recipe, format) → a capture tour (capture-tour.js) that films one Hearth moment
//   IntroData.copyFor(area, i, vars) / hooks / ctas / featureLines(counts) → words from the app's own features
const IntroData = (() => {
  const r2 = (x) => Math.round(x * 100) / 100;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const slug = (s) => String(s || 'video').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'video';

  // ---------- formats: one edit, rendered for every platform ----------
  // preset: Video Review's export preset (tools/video-data.js) that reframes the program for that shape
  const FORMATS = [
    { id: '9:16', label: 'Vertical 9:16', where: 'Reels · TikTok · Shorts · Stories', preset: 'reels', w: 1080, h: 1920 },
    { id: '16:9', label: 'Wide 16:9', where: 'YouTube · X · LinkedIn · your site', preset: 'yt1080', w: 1920, h: 1080 },
    { id: '1:1', label: 'Square 1:1', where: 'Feed posts everywhere', preset: 'square', w: 1080, h: 1080 },
    { id: '4:5', label: 'Portrait 4:5', where: 'Instagram / Facebook feed', preset: 'feed45', w: 1080, h: 1350 },
  ];
  const FORMAT = Object.fromEntries(FORMATS.map((f) => [f.id, f]));
  const parseFormat = (w) => { const s = String(w || '').trim().toLowerCase().replace(/x/g, ':').replace(/\s/g, ''); const alias = { vertical: '9:16', portrait: '4:5', wide: '16:9', landscape: '16:9', square: '1:1', reel: '9:16', reels: '9:16', tiktok: '9:16', shorts: '9:16', story: '9:16', youtube: '16:9', feed: '4:5', insta: '1:1' }; return FORMAT[s] ? s : alias[s] || null; };

  // ---------- what a beat can be ----------
  const KINDS = {
    title: { icon: 'Aa', label: 'Words', what: 'kinetic words on a color: nothing to film' },
    lab: { icon: '✦', label: 'Lab scene', what: 'a Three.js scene Claude and Astra jam on, recorded from the Lab' },
    tour: { icon: '▶', label: 'Hearth on screen', what: 'Hearth itself, filmed hands-free by a capture tour' },
    shot: { icon: '▣', label: 'Screenshot', what: 'a still of Hearth with a slow push in' },
    stat: { icon: '#', label: 'A number', what: 'a big number counted from the app itself' },
    end: { icon: '★', label: 'End card', what: 'the name, one line and a call to action' },
  };

  // ---------- the looks of a video (titles, transitions, grade) ----------
  // Transition sets by energy: the edit uses them in turn on its cuts (ids from tools/cut-presets.js).
  const TRANSITION_SETS = [
    { id: 'calm', name: 'Calm: dissolves and dips', list: ['dissolve', 'slow-dissolve', 'dip-black'], dur: 0.5 },
    { id: 'bold', name: 'Bold: pushes and zooms', list: ['push-left', 'zoom-in', 'push-up'], dur: 0.35 },
    { id: 'hype', name: 'Hype: flashes and glitches', list: ['flash-white', 'glitch', 'zoom-cross', 'whip-right'], dur: 0.25 },
    { id: 'forge', name: 'Forge: gold dips and ember leaks', list: ['dip-gold', 'gold-edge-wipe', 'leak-ember'], dur: 0.4 },
    { id: 'clean', name: 'Clean: straight cuts', list: ['cut'], dur: 0 },
    { id: 'cinema', name: 'Cinema: dips to black and light leaks', list: ['dip-black', 'light-leak', 'film-burn'], dur: 0.6 },
    { id: 'tech', name: 'Tech: RGB splits and pixels', list: ['rgb-split', 'pixelate', 'blocks'], dur: 0.3 },
    { id: 'soft', name: 'Soft: blur dissolves', list: ['blur-dissolve', 'blur-push-left', 'blur-push-up'], dur: 0.45 },
    { id: 'violet', name: 'Violet: AI-violet flashes and leaks', list: ['flash-violet', 'leak-violet', 'edge-wipe-violet'], dur: 0.3 },
    { id: 'rainbow', name: 'Rainbow: every Hearth color in turn', list: ['flash-gold', 'flash-violet', 'flash-cyan', 'flash-pink'], dur: 0.25 },
    { id: 'geometric', name: 'Geometric: irises, clocks and diagonals', list: ['iris-open', 'clock', 'diag-tr'], dur: 0.4 },
    { id: 'kinetic', name: 'Kinetic: spins, squeezes and ripples', list: ['spin', 'squeeze-h', 'ripple'], dur: 0.3 },
    { id: 'graphic', name: 'Graphic: shutters, slices and checkers', list: ['shutter', 'slices-left', 'checker'], dur: 0.35 },
    { id: 'reveal', name: 'Reveal: doors, covers and reveals', list: ['doors-open-h', 'cover-left', 'reveal-up'], dur: 0.4 },
  ];
  // Title looks: the hook, the words on beats, the end card (title style + in animation, cut-presets ids).
  const TITLE_LOOKS = [
    { id: 'giant', name: 'Giant words', hook: ['intro-giant', 'words-rise'], body: ['caption-tiktok', 'pop-words'], end: ['hook-end-card', 'fade-up'] },
    { id: 'forge', name: 'Forge gold', hook: ['big-gold', 'letters-rise'], body: ['caption-gold', 'words-rise'], end: ['intro-ember', 'fade-up'] },
    { id: 'chrome', name: 'Chrome', hook: ['intro-chrome', 'tracking-in'], body: ['glass', 'fade-up'], end: ['chrome', 'zoom-out'] },
    { id: 'neon', name: 'Neon', hook: ['neon', 'neon-flicker'], body: ['neon-white', 'fade-up'], end: ['neon-violet', 'neon-on'] },
    { id: 'kinetic', name: 'Kinetic', hook: ['kinetic', 'kinetic'], body: ['huge-white', 'words-drop'], end: ['huge-gold', 'stamp'] },
    { id: 'minimal', name: 'Minimal', hook: ['thin', 'fade-slow'], body: ['subtitle', 'fade'], end: ['display', 'fade-up'] },
    { id: 'mono', name: 'Terminal mono', hook: ['intro-mono-tag', 'typewriter'], body: ['mono', 'type-fast'], end: ['tech-green', 'type-cursor'] },
    { id: 'serif', name: 'Editorial serif', hook: ['intro-serif-big', 'blur-in'], body: ['serif', 'fade-up'], end: ['quote-gold', 'fade-up'] },
    { id: 'hook', name: 'Social hook', hook: ['hook-yellow', 'pop'], body: ['caption-yellow', 'pop-words'], end: ['hook-end-card', 'pop'] },
    { id: 'outline', name: 'Outline', hook: ['intro-giant-outline', 'zoom-through'], body: ['outline-white', 'words-rise'], end: ['intro-stroke-fill', 'fade-up'] },
    { id: 'violet', name: 'AI violet', hook: ['big-violet', 'letters-rise-blur'], body: ['caption-violet', 'words-rise'], end: ['intro-violet', 'fade-up'] },
    { id: 'ember', name: 'Ember', hook: ['huge-ember', 'letters-rise'], body: ['caption-ember', 'words-slide'], end: ['intro-ember', 'zoom-out'] },
    { id: 'retro', name: 'Retro', hook: ['retro', 'letters-wave'], body: ['caption-yellow', 'words-flip'], end: ['retro', 'stamp'] },
    { id: 'glitch', name: 'Glitch', hook: ['intro-wide', 'glitch-letters'], body: ['outline-cyan', 'scramble'], end: ['neon-cyan', 'glitch-letters'] },
    { id: 'question', name: 'Question hook', hook: ['hook-question', 'pop'], body: ['caption-white-box', 'pop-words'], end: ['hook-end-card', 'pop'] },
    { id: 'pov', name: 'POV', hook: ['hook-pov', 'typewriter'], body: ['caption-tiktok', 'words-elastic'], end: ['hook-end-card', 'fade-up'] },
    { id: 'sticker', name: 'Stickers', hook: ['sticker', 'heartbeat'], body: ['boxed-gold', 'pop'], end: ['sticker', 'stamp'] },
    { id: 'editorial', name: 'Editorial left', hook: ['headline-left', 'unfold'], body: ['headline-left', 'fade-up'], end: ['display', 'box-reveal'] },
    { id: 'gold-black', name: 'Gold on black', hook: ['gold-on-black', 'tracking-blur'], body: ['outline-gold', 'rise-slow'], end: ['gold-on-black', 'zoom-through'] },
    { id: 'tilted', name: 'Tilted', hook: ['intro-tilted', 'spin-zoom'], body: ['neon-pink', 'neon-on'], end: ['big-ember', 'highlight'] },
  ];
  // Grades the whole edit can take (cut-presets LOOKS), picked from the vibe when nobody chooses.
  const GRADES = ['forgeheart', 'molten', 'punchy', 'clean', 'cyberpunk', 'synthwave', 'teal-orange', 'moody', 'airy', 'noir-cine', 'vivid', 'forge-ai',
    'forge-gold-dark', 'forge-steel', 'forge-rainbow', 'mv-chrome', 'golden-hour', 'blue-hour', 'anamorphic', '80s', 'hologram', 'ice-neon', 'dream', 'kodachrome'];
  // Colors for word beats (backgrounds) by mood
  const BACKDROPS = { dark: '#0b0710', ember: '#1a0a05', violet: '#130b24', gold: '#1c1404', light: '#f4efe6', ink: '#05070c', red: '#1d0507', teal: '#03161a' };

  // ---------- beat templates (whole videos, one click) ----------
  // beats: { kind, secs, words?, sub?, area? (tour / shot recipe), scene? (the jam's idea seed), stat?, pri (1 = kept
  // in short cuts, 3 = first to go) }. {name}, {tagline}, {cta} and {n:<counter>} are filled when the plan is made.
  const B = (kind, secs, o = {}) => ({ kind, secs, pri: 2, ...o });
  const TEMPLATES = [
    { id: 'product-intro', name: 'Product intro', secs: 20, fmts: ['9:16', '16:9', '1:1'], trans: 'bold', titles: 'giant', grade: 'forgeheart', hint: 'The app in 20 s: a hook, a Lab visual, the chats, the board, the editor, the end card', beats: [
      B('title', 2, { words: '{hook}', pri: 1 }), B('lab', 3, { scene: 'a bold opening visual that sets the mood', words: 'Visuals you shape with sliders', pri: 1 }),
      B('tour', 3, { area: 'chats', words: 'Claude and Astra, side by side', pri: 1 }), B('tour', 3, { area: 'board', words: 'A mood board for the vibe' }),
      B('tour', 3, { area: 'editor', words: 'A frame-exact video editor' }), B('lab', 3, { scene: 'a climax visual, the peak of the video', words: 'Made together, in one window' }),
      B('end', 3, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'feature-tour', name: 'Feature tour', secs: 30, fmts: ['16:9', '9:16'], trans: 'calm', titles: 'minimal', grade: 'clean', hint: 'One feature per beat, calm pace, a word under each', beats: [
      B('title', 2.5, { words: '{name}', sub: 'a quick tour', pri: 1 }), B('tour', 4, { area: 'chats', words: 'Chat with Claude and Astra', pri: 1 }), B('tour', 4, { area: 'lab', words: 'Build visuals in the Lab', pri: 1 }),
      B('tour', 4, { area: 'board', words: 'Collect references on the board' }), B('tour', 4, { area: 'editor', words: 'Cut it frame by frame' }), B('tour', 4, { area: 'capture', words: 'Film the app from itself' }),
      B('tour', 4, { area: 'palette', words: 'Everything one command away', pri: 3 }), B('end', 3.5, { words: '{name}', sub: '{cta}', pri: 1 })] },
    { id: 'teaser', name: 'Teaser', secs: 10, fmts: ['9:16', '1:1'], trans: 'hype', titles: 'kinetic', grade: 'molten', hint: 'Fast cuts, few words, the name at the end', beats: [
      B('lab', 1.5, { scene: 'a flash of light, a teasing glimpse', pri: 1 }), B('title', 1.5, { words: 'Something new', pri: 1 }), B('tour', 1.5, { area: 'lab-sizes' }), B('lab', 1.5, { scene: 'a fast burst of particles' }),
      B('tour', 1.5, { area: 'jam' }), B('end', 2.5, { words: '{name}', sub: 'soon', pri: 1 })] },
    { id: 'changelog', name: 'Changelog clip', secs: 15, fmts: ['9:16', '16:9'], trans: 'clean', titles: 'mono', grade: 'clean', hint: 'What\'s new this week: one beat per change, a number to open', beats: [
      B('stat', 2, { stat: 'commands', words: 'What\'s new', pri: 1 }), B('tour', 3, { area: 'board', words: 'New: the mood board', pri: 1 }), B('tour', 3, { area: 'editor', words: 'New: the video editor' }),
      B('tour', 3, { area: 'capture', words: 'New: Hearth films itself' }), B('end', 3, { words: '{name}', sub: 'update out now', pri: 1 })] },
    { id: 'loop', name: 'Loop for socials', secs: 6, fmts: ['9:16', '1:1'], trans: 'soft', titles: 'minimal', grade: 'punchy', loop: true, hint: 'A seamless 6 s loop: the end flows back into the start', beats: [
      B('lab', 3, { scene: 'a hypnotic seamless loop', pri: 1 }), B('lab', 3, { scene: 'the same loop, one twist further', words: '{name}', pri: 1 })] },
    { id: 'launch', name: 'Launch day', secs: 15, fmts: ['9:16', '16:9', '1:1'], trans: 'hype', titles: 'hook', grade: 'vivid', hint: 'Countdown energy, the hook, three features, out now', beats: [
      B('title', 1.5, { words: 'It\'s here.', pri: 1 }), B('lab', 2.5, { scene: 'an explosive reveal', words: '{name}', pri: 1 }), B('tour', 2.5, { area: 'chats', words: 'Two AIs' }),
      B('tour', 2.5, { area: 'lab', words: 'One Lab' }), B('tour', 2.5, { area: 'editor', words: 'Every frame' }), B('end', 3.5, { words: '{name}', sub: 'out now', pri: 1 })] },
    { id: 'tutorial', name: 'How-to', secs: 30, fmts: ['16:9'], trans: 'calm', titles: 'minimal', grade: 'clean', hint: 'Step by step, a number per step', beats: [
      B('title', 3, { words: 'How to make a visual', sub: 'in {name}', pri: 1 }), B('tour', 6, { area: 'lab', words: '1 · Open the Lab', pri: 1 }), B('tour', 6, { area: 'jam', words: '2 · Let Claude and Astra jam' }),
      B('tour', 6, { area: 'editor', words: '3 · Cut it in the editor', pri: 1 }), B('tour', 5, { area: 'capture', words: '4 · Export for every app' }), B('end', 4, { words: 'Your turn', sub: '{name}', pri: 1 })] },
    { id: 'before-after', name: 'Before / after', secs: 12, fmts: ['9:16', '1:1'], trans: 'bold', titles: 'hook', grade: 'punchy', hint: 'The old way, then the Hearth way', beats: [
      B('title', 2, { words: 'Ten tabs. Two AIs. Chaos.', pri: 1 }), B('shot', 2.5, { area: 'chats', words: 'Before', pri: 3 }), B('title', 1.5, { words: 'Now:', pri: 2 }),
      B('tour', 3, { area: 'chats', words: 'One window', pri: 1 }), B('end', 3, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'kinetic', name: 'Kinetic words (nothing to film)', secs: 8, fmts: ['9:16', '1:1', '16:9'], trans: 'hype', titles: 'kinetic', grade: 'forgeheart', hint: 'Only words on color: renders in seconds', beats: [
      B('title', 1.6, { words: 'One window', pri: 1 }), B('title', 1.6, { words: 'Two AIs' }), B('title', 1.6, { words: 'Zero tabs' }), B('end', 3.2, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'music-visual', name: 'Music visual', secs: 15, fmts: ['9:16'], trans: 'clean', titles: 'minimal', grade: 'punchy', hint: 'Lab scenes cut on the bars of your song, the name at the end', beats: [
      B('lab', 4, { scene: 'an intro that breathes with the music', pri: 1 }), B('lab', 4, { scene: 'the build, tension rising' }), B('lab', 4, { scene: 'the drop: everything at once', pri: 1 }), B('end', 3, { words: '{name}', sub: 'made in the Lab', pri: 1 })] },
    { id: 'jam-story', name: 'Claude ⇄ Astra jam story', secs: 20, fmts: ['9:16', '16:9'], trans: 'violet', titles: 'violet', grade: 'forge-ai', hint: 'How two AIs make one visual: the jam card, the rounds, the result', beats: [
      B('title', 2, { words: 'Two AIs. One visual.', pri: 1 }), B('tour', 4, { area: 'jam', words: 'Claude builds, Astra directs', pri: 1 }), B('lab', 3, { scene: 'round one: a rough idea' }),
      B('lab', 3, { scene: 'round two: Astra pushed the contrast', pri: 1 }), B('tour', 4, { area: 'jam-card', words: 'The best round is kept' }), B('end', 4, { words: '{name}', sub: 'AIs that jam', pri: 1 })] },
    { id: 'one-feature', name: 'One feature spotlight', secs: 8, fmts: ['9:16', '1:1'], trans: 'bold', titles: 'hook', grade: 'punchy', hint: 'One thing, shown well', beats: [
      B('title', 1.5, { words: 'Did you know?', pri: 1 }), B('tour', 4, { area: 'board', words: 'Your references become a vibe', pri: 1 }), B('end', 2.5, { words: '{name}', sub: '{cta}', pri: 1 })] },
    { id: 'board-to-video', name: 'From mood board to video', secs: 15, fmts: ['9:16', '16:9'], trans: 'soft', titles: 'serif', grade: 'airy', hint: 'References in, a visual out: the vibe, never the footage', beats: [
      B('tour', 3, { area: 'board', words: 'Start with a vibe', pri: 1 }), B('tour', 3, { area: 'board-vibe', words: 'Hearth reads it' }), B('lab', 3, { scene: 'a visual built from the board\'s vibe', words: 'The AIs build on it', pri: 1 }),
      B('tour', 3, { area: 'editor', words: 'You cut it' }), B('end', 3, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'stat-hype', name: 'Numbers', secs: 10, fmts: ['9:16', '1:1'], trans: 'hype', titles: 'kinetic', grade: 'vivid', hint: 'Big numbers counted from the app itself', beats: [
      B('stat', 2, { stat: 'commands', pri: 1 }), B('stat', 2, { stat: 'transitions' }), B('stat', 2, { stat: 'looks' }), B('stat', 1.5, { stat: 'formats', pri: 3 }), B('end', 2.5, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'cinematic', name: 'Cinematic', secs: 25, fmts: ['16:9', '9:16'], trans: 'cinema', titles: 'serif', grade: 'noir-cine', hint: 'Slow, wide, dark: a trailer for the app', beats: [
      B('lab', 4, { scene: 'a slow cinematic reveal in the dark', pri: 1 }), B('title', 3, { words: 'In one window…' }), B('tour', 4, { area: 'lab', words: 'worlds are built', pri: 1 }),
      B('tour', 4, { area: 'chats', words: 'by two minds' }), B('lab', 4, { scene: 'a vast final shot, light breaking through' }), B('end', 6, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'countdown', name: 'Countdown', secs: 8, fmts: ['9:16'], trans: 'hype', titles: 'kinetic', grade: 'molten', hint: '3 · 2 · 1, then the name', beats: [
      B('title', 1, { words: '3', pri: 1 }), B('title', 1, { words: '2', pri: 1 }), B('title', 1, { words: '1', pri: 1 }), B('lab', 2.5, { scene: 'an explosion of light on the count of zero', pri: 1 }), B('end', 2.5, { words: '{name}', sub: 'now', pri: 1 })] },
    { id: 'daily-tip', name: 'Daily tip', secs: 12, fmts: ['9:16'], trans: 'clean', titles: 'hook', grade: 'clean', hint: 'One tip: a hook, the move on screen, the command', beats: [
      B('title', 2, { words: 'Hearth tip #1', pri: 1 }), B('tour', 6, { area: 'palette', words: 'Everything is one command away', pri: 1 }), B('end', 4, { words: 'Ctrl+;', sub: 'try it', pri: 1 })] },
    { id: 'behind-scenes', name: 'Behind the scenes', secs: 20, fmts: ['9:16', '16:9'], trans: 'soft', titles: 'minimal', grade: 'moody', hint: 'How the video you\'re watching was made, in Hearth', beats: [
      B('title', 2, { words: 'This video was made in {name}', pri: 1 }), B('tour', 4, { area: 'board', words: 'The vibe' }), B('tour', 4, { area: 'jam', words: 'The jam', pri: 1 }),
      B('tour', 4, { area: 'capture', words: 'The capture' }), B('tour', 3, { area: 'editor', words: 'The edit', pri: 1 }), B('end', 3, { words: '{name}', sub: 'made by itself', pri: 1 })] },
    { id: 'bumper', name: 'Bumper 6 s', secs: 6, fmts: ['16:9', '9:16', '1:1'], trans: 'bold', titles: 'giant', grade: 'forgeheart', hint: 'The shortest ad: one visual, the name', beats: [
      B('lab', 3, { scene: 'one striking visual', pri: 1 }), B('end', 3, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'shorts-hook', name: 'Shorts hook', secs: 15, fmts: ['9:16'], trans: 'hype', titles: 'hook', grade: 'vivid', hint: 'A question in the first second, the answer on screen', beats: [
      B('title', 1.5, { words: 'What if your AIs worked together?', pri: 1 }), B('tour', 3.5, { area: 'jam', words: 'They can.', pri: 1 }), B('lab', 3, { scene: 'the result of the jam, glowing' }),
      B('tour', 3.5, { area: 'chats', words: 'Claude and Astra, one window' }), B('end', 3.5, { words: '{name}', sub: '{cta}', pri: 1 })] },
    { id: 'milestone', name: 'Milestone / thanks', secs: 10, fmts: ['9:16', '1:1'], trans: 'rainbow', titles: 'forge', grade: 'forgeheart', hint: 'A big number, a thank you', beats: [
      B('stat', 3, { stat: 'commands', words: 'commands and counting', pri: 1 }), B('lab', 3, { scene: 'a celebration of light' }), B('end', 4, { words: 'Thank you', sub: '{name}', pri: 1 })] },
    { id: 'dev-log', name: 'Dev log', secs: 20, fmts: ['16:9', '9:16'], trans: 'tech', titles: 'mono', grade: 'clean', hint: 'What I built this week, terminal style', beats: [
      B('title', 2.5, { words: '> devlog', sub: '{name}', pri: 1 }), B('tour', 4, { area: 'editor', words: 'the editor got frames', pri: 1 }), B('tour', 4, { area: 'capture', words: 'the app films itself' }),
      B('tour', 4, { area: 'board', words: 'a board for references' }), B('end', 5.5, { words: '{name}', sub: 'next week: more', pri: 1 })] },
    { id: 'lab-showcase', name: 'Lab showcase', secs: 15, fmts: ['9:16', '1:1'], trans: 'bold', titles: 'neon', grade: 'synthwave', hint: 'Only Lab visuals, a word each', beats: [
      B('lab', 3, { scene: 'neon geometry', words: 'Shape it', pri: 1 }), B('lab', 3, { scene: 'liquid chrome', words: 'Shuffle it' }), B('lab', 3, { scene: 'a particle storm', words: 'Freeze it', pri: 1 }),
      B('tour', 3, { area: 'lab-sizes', words: 'Every frame size' }), B('end', 3, { words: '{name}', sub: 'the Lab', pri: 1 })] },
    { id: 'carousel', name: 'Screenshot carousel', secs: 12, fmts: ['4:5', '1:1'], trans: 'soft', titles: 'minimal', grade: 'clean', hint: 'Stills of each screen with a slow push: nothing to record', beats: [
      B('title', 2, { words: '{name}', sub: 'a look inside', pri: 1 }), B('shot', 2.5, { area: 'lab', words: 'The Lab', pri: 1 }), B('shot', 2.5, { area: 'board', words: 'The board' }),
      B('shot', 2.5, { area: 'editor', words: 'The editor' }), B('end', 2.5, { words: '{name}', sub: '{cta}', pri: 1 })] },
    { id: 'speedrun', name: 'Speedrun (everything in 10 s)', secs: 10, fmts: ['9:16', '1:1'], trans: 'hype', titles: 'kinetic', grade: 'vivid', hint: 'Every screen for a second: chats, Lab, board, editor, jam', beats: [
      B('title', 1, { words: 'Everything.', pri: 1 }), B('tour', 1.2, { area: 'chats', pri: 1 }), B('tour', 1.2, { area: 'lab' }), B('tour', 1.2, { area: 'board' }), B('tour', 1.2, { area: 'editor' }),
      B('tour', 1.2, { area: 'jam' }), B('tour', 1.2, { area: 'palette', pri: 3 }), B('end', 1.8, { words: '{name}', sub: 'one window', pri: 1 })] },
    { id: 'nodes-story', name: 'Code as nodes', secs: 12, fmts: ['9:16', '16:9'], trans: 'tech', titles: 'mono', grade: 'clean', hint: 'A visual, then the node graph behind it', beats: [
      B('lab', 3, { scene: 'a glowing shape built as a node graph', words: 'This is code', pri: 1 }), B('tour', 4, { area: 'lab-layers', words: 'Every layer, a graph', pri: 1 }), B('lab', 2.5, { scene: 'the same shape, rewired' }), B('end', 2.5, { words: '{name}', sub: 'wire it', pri: 1 })] },
    { id: 'drop', name: 'On the drop', secs: 8, fmts: ['9:16'], trans: 'hype', titles: 'giant', grade: 'molten', hint: 'Calm until the drop of your song, then everything at once (cuts: drop)', beats: [
      B('lab', 3, { scene: 'a calm build, almost still', pri: 1 }), B('lab', 3, { scene: 'the drop: an explosion of color', words: '{name}', pri: 1 }), B('end', 2, { words: '{name}', sub: '{tagline}', pri: 1 })] },
    { id: 'question', name: 'Question → answer', secs: 12, fmts: ['9:16', '1:1'], trans: 'bold', titles: 'question', grade: 'punchy', hint: 'Ask what everyone wonders, answer on screen', beats: [
      B('title', 2, { words: 'Can two AIs make a video together?', pri: 1 }), B('tour', 3, { area: 'jam', words: 'Yes.', pri: 1 }), B('lab', 3, { scene: 'what they made, glowing' }), B('tour', 2, { area: 'editor', words: 'And cut it.' }), B('end', 2, { words: '{name}', sub: '{cta}', pri: 1 })] },
    { id: 'week-recap', name: 'Week in Hearth', secs: 20, fmts: ['9:16', '16:9'], trans: 'calm', titles: 'editorial', grade: 'clean', hint: 'What you made this week: the board, the jams, the edits', beats: [
      B('title', 2.5, { words: 'This week in {name}', pri: 1 }), B('tour', 4, { area: 'board', words: 'Collected', pri: 1 }), B('tour', 4, { area: 'jam-card', words: 'Jammed' }), B('lab', 3.5, { scene: 'the best visual of the week' }),
      B('tour', 3, { area: 'editor', words: 'Cut' }), B('end', 3, { words: '{name}', sub: 'see you next week', pri: 1 })] },
  ];
  const TEMPLATE = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
  const findTemplate = (q) => { const s = String(q || '').toLowerCase().trim(); if (!s) return null; return TEMPLATE[s] || TEMPLATES.find((t) => t.name.toLowerCase() === s) || TEMPLATES.find((t) => t.id.startsWith(s) || t.name.toLowerCase().includes(s)) || null; };

  // ---------- tour recipes: one Hearth moment each, filmed by a capture tour ----------
  // steps: capture-tour.js lines without record / stop (tourText wraps them); they only look, hover and zoom, so a
  // recording never changes the owner's work.
  const RECIPES = [
    { id: 'chats', area: 'Chats', name: 'The chats', secs: 3, steps: 'open claude\nwait 0.4s\nzoom ".messages-wrap" 1.15 1s\nwait 1.2s\nhover ".composer textarea"\nwait 0.6s\nzoom out 0.4s' },
    { id: 'chats-astra', area: 'Chats', name: 'Astra\'s chat', secs: 3, steps: 'open astra\nwait 0.5s\npush ".messages-wrap" 1.2 2s\nwait 0.6s' },
    { id: 'chats-composer', area: 'Chats', name: 'The chat box', secs: 3, steps: 'open claude\nwait 0.4s\nzoom ".composer" 1.6 0.8s\nhover ".composer textarea"\nwait 1.4s\nzoom out 0.5s' },
    { id: 'palette', area: 'Commands', name: 'The command bar', secs: 3, steps: 'open claude\nwait 0.3s\nkey Ctrl+;\nwait 1.6s\nesc\nwait 0.6s' },
    { id: 'palette-k', area: 'Commands', name: 'The palette (Ctrl+K)', secs: 3, steps: 'open claude\nwait 0.3s\nkey Ctrl+K\nwait 1.6s\nesc\nwait 0.6s' },
    { id: 'lab', area: 'Lab', name: 'The Lab', secs: 3, steps: 'open three\nwait 0.6s\nzoom ".three-preview" 1.25 1s\nwait 1s\nzoom out 0.4s' },
    { id: 'lab-push', area: 'Lab', name: 'A slow push on the Lab picture', secs: 3, steps: 'open three\nwait 0.5s\npush ".three-preview" 1.35 2.5s' },
    { id: 'lab-sizes', area: 'Lab', name: 'The frame sizes', secs: 3, steps: 'open three\nwait 0.4s\nhighlight ".three-preview" 1.5s\nwait 1.2s' },
    { id: 'lab-sliders', area: 'Lab', name: 'The sliders', secs: 3, steps: 'open three\nwait 0.4s\nhover ".tweaks"\nzoom ".tweaks" 1.3 0.9s\nwait 1.4s\nzoom out 0.4s' },
    { id: 'lab-timeline', area: 'Lab', name: 'The music timeline', secs: 3, steps: 'open three\nwait 0.4s\nzoom ".media-bar" 1.4 0.9s\nwait 1.4s\nzoom out 0.4s' },
    { id: 'lab-layers', area: 'Lab', name: 'The layers', secs: 3, steps: 'open three\nwait 0.4s\nhighlight ".layers" 1.4s\nwait 1.2s' },
    { id: 'lab-tilt', area: 'Lab', name: 'The Lab in 3D', secs: 3, steps: 'open three\nwait 0.4s\ntilt 12 -8 1.2s\nwait 1s\ntilt 0 0 0.6s' },
    { id: 'director', area: 'Lab', name: 'The Three Director', secs: 3, steps: 'open three\nwait 0.4s\nzoom ".tool-dock" 1.25 1s\nwait 1.2s\nzoom out 0.4s' },
    { id: 'jam', area: 'Jam', name: 'Claude and Astra jamming', secs: 4, steps: 'open three\nwait 0.4s\nhighlight ".jam-card" 1.6s\nzoom ".tool-dock" 1.3 1s\nwait 1.4s\nzoom out 0.5s' },
    { id: 'jam-card', area: 'Jam', name: 'The jam card', secs: 4, steps: 'open three\nwait 0.4s\nscroll ".tool-dock .messages-wrap" 400\nzoom ".jam-card" 1.5 1s\nwait 1.8s\nzoom out 0.5s' },
    { id: 'board', area: 'Board', name: 'The mood board', secs: 3, steps: 'open board\nwait 0.6s\npush ".bd-vp" 1.25 2.2s' },
    { id: 'board-vibe', area: 'Board', name: 'The board\'s vibe', secs: 3, steps: 'open board\nwait 0.5s\nzoom ".bd-vp" 1.5 1s\nwait 1.2s\nzoom out 0.5s' },
    { id: 'board-drift', area: 'Board', name: 'Drifting over the board', secs: 3, steps: 'open board\nwait 0.4s\nzoom ".bd-vp" 1.3 0.6s\npan 120 40 1.6s\nwait 0.4s' },
    { id: 'editor', area: 'Editor', name: 'The video editor', secs: 3, steps: 'open ae\nwait 0.6s\nzoom ".vr-timeline" 1.35 1s\nwait 1.2s\nzoom out 0.4s' },
    { id: 'editor-stage', area: 'Editor', name: 'The program monitor', secs: 3, steps: 'open ae\nwait 0.5s\npush ".vr-stage" 1.2 2.4s' },
    { id: 'editor-timeline', area: 'Editor', name: 'The timeline, close', secs: 3, steps: 'open ae\nwait 0.4s\nzoom ".vr-timeline" 1.6 1s\nwait 1.4s\nzoom out 0.4s' },
    { id: 'review', area: 'Editor', name: 'Video Review', secs: 3, steps: 'open ae\nwait 0.5s\nhighlight ".vr-stage" 1.6s\nwait 1s' },
    { id: 'capture', area: 'Capture', name: 'Hearth filming itself', secs: 3, steps: 'open claude\nwait 0.3s\ntimecode on\nwait 1.8s\ntimecode off\nwait 0.4s' },
    { id: 'capture-cinema', area: 'Capture', name: 'A cinematic sweep', secs: 4, steps: 'open three\nwait 0.3s\nletterbox on\ntilt 8 6 1.4s\nwait 1s\ntilt 0 0 0.6s\nletterbox off' },
    { id: 'looks', area: 'Looks', name: 'Hearth\'s looks', secs: 3, steps: 'open claude\nwait 0.3s\nzoom "#rail" 1.6 0.8s\nwait 1.4s\nzoom out 0.4s' },
    { id: 'rail', area: 'Looks', name: 'The rail', secs: 3, steps: 'open claude\nwait 0.3s\nhighlight "#rail" 1.6s\nwait 1s' },
    { id: 'meter', area: 'Looks', name: 'The token meter', secs: 3, steps: 'open claude\nwait 0.3s\nhighlight ".meter-pill" 1.6s\nwait 1s' },
    { id: 'whole', area: 'Looks', name: 'The whole window, wide', secs: 3, steps: 'open three\nwait 0.4s\nzoom out 0.2s\ntilt 6 -4 1.2s\nwait 1s\ntilt 0 0 0.5s' },
  ];
  const RECIPE = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
  // The capture target a screenshot beat takes for an area (Capture.shot targets / CSS selectors)
  const SHOT_TARGET = { chats: 'chat', lab: 'lab', board: 'tool', editor: 'tool', jam: 'dock', capture: 'window', palette: 'window' };
  const SHOT_OPEN = { chats: 'claude', lab: 'three', board: 'board', editor: 'ae', jam: 'three', capture: 'claude', palette: 'claude' };
  // A recipe as a whole tour: filmed at the project's main format, silent (the music comes in the edit), MP4.
  function tourText(recipe, format = '9:16', { fps = 30 } = {}) {
    const r = typeof recipe === 'string' ? RECIPE[recipe] : recipe;
    if (!r) return '';
    // the screen it films is opened (and settles) before the recording starts, so the take begins on it
    const lines = String(r.steps).split('\n');
    let k = 0; while (k < lines.length && /^(open|wait)\b/.test(lines[k])) k += 1;
    const pre = lines.slice(0, k);
    return `# ${r.name} (for a video project)\n${pre.length ? `${pre.join('\n')}\nwait 0.5s\n` : ''}record ${format} ${fps}fps mute mp4\n${lines.slice(k).join('\n')}\nstop`;
  }
  const recipeFor = (area) => RECIPE[area] || RECIPES.find((r) => r.area.toLowerCase() === String(area || '').toLowerCase()) || RECIPE.chats;

  // ---------- words: from the app's own features ----------
  const HOOKS = [
    'Meet {name}.', 'One window. Two minds.', 'Your AI studio, in one window.', 'Claude and Astra, jamming for you.', 'Stop switching tabs.',
    'What if your AIs worked together?', 'Made in {name}, by {name}.', 'Ideas in. Videos out.', 'Two AIs. One visual.', 'Your references become a vibe.',
    'Every frame, exactly.', 'The app that films itself.', 'Talk. Shape. Cut. Post.', 'From a mood to a motion.', 'Built for people who make things.',
    'POV: your AIs finally talk.', 'Tabs: 0. Ideas: all of them.', 'Describe it. Watch it build.', 'Made in one evening.', 'This intro edited itself.', 'Claude builds. Astra directs.', 'Your studio has two brains now.',
  ];
  const TAGLINES = ['one window for your AI agents', 'your AI studio', 'Claude and Astra, together', 'visuals, chats and cuts in one place', 'where the AIs jam', 'made for makers'];
  const CTAS = ['Try it tonight.', 'Link in bio.', 'Coming soon.', 'Made in Hearth.', 'Follow for more.', 'Out now.', 'Your turn.'];
  const LINES = {
    chats: ['Claude and Astra, side by side', 'Two AIs, one conversation', 'Ask once, get two minds', 'Every chat action is a /command', 'Hand a task from Claude to Astra'],
    lab: ['Visuals you shape with sliders', 'Three.js, without writing code', 'Save. Shuffle. Freeze.', 'Every social frame size', 'A new layer for every idea'],
    board: ['Collect references on the board', 'Your references become a vibe', 'A vibe, never a copy', 'Pictures, clips and sites in one place', 'Drag a reference into any chat'],
    editor: ['A frame-exact video editor', 'Titles, transitions, keyframes', 'Cut it frame by frame', 'One edit, every format', '131 transitions, no plug-ins'],
    capture: ['Hearth films itself', 'Screenshots of any screen', 'Hands-free tours', 'Every frame read exactly'],
    jam: ['Claude builds, Astra directs', 'Two AIs jam on one visual', 'Every round is an undo point', 'The best round is kept'],
    palette: ['Everything one command away', 'Plain words work too', 'Ctrl+; over any tool'],
    looks: ['31 looks, chrome and glass', 'Bold Forgeheart colors', 'Make it yours'],
    nodes: ['Code you can see as nodes', 'Wire it, don\'t write it', 'Every layer, a graph'],
    music: ['Cut on the beat', 'Tap the tempo, it follows', 'Visuals that hear the drop'],
  };
  // Lines with real numbers counted from the running app (intro.js passes the counts)
  const STATS = [
    { id: 'commands', label: 'chat commands', line: (n) => `${n} chat commands` },
    { id: 'transitions', label: 'transitions', line: (n) => `${n} transitions` },
    { id: 'looks', label: 'color grades', line: (n) => `${n} color grades` },
    { id: 'titles', label: 'title styles', line: (n) => `${n} title styles` },
    { id: 'templates', label: 'video templates', line: (n) => `${n} video templates` },
    { id: 'effects', label: 'Lab effects', line: (n) => `${n} Lab effects` },
    { id: 'tours', label: 'tour steps', line: (n) => `${n} tour steps` },
    { id: 'formats', label: 'social formats', line: (n) => `${n} social formats` },
    { id: 'agents', label: 'AI agents', line: (n) => `${n} AI agents, one window` },
    { id: 'shapes', label: 'motion graphics', line: (n) => `${n} motion graphics` },
  ];
  const STAT = Object.fromEntries(STATS.map((s) => [s.id, s]));
  const featureLines = (counts = {}) => STATS.filter((s) => counts[s.id] > 0).map((s) => s.line(counts[s.id]));
  // Post captions for each platform (the words under the video), filled from the plan
  const POSTS = [
    { id: 'instagram', name: 'Instagram', text: '{hook} {line}. {cta}\n\n{tags}', tags: '#motiondesign #ai #threejs #creativetools #madewithhearth' },
    { id: 'tiktok', name: 'TikTok', text: '{hook} {cta} {tags}', tags: '#ai #motiondesign #fyp #techtok #creative' },
    { id: 'youtube', name: 'YouTube Shorts', text: '{hook} — {line}. {cta} {tags}', tags: '#shorts #ai #motiongraphics' },
    { id: 'x', name: 'X', text: '{hook} {line}. {cta}', tags: '' },
    { id: 'linkedin', name: 'LinkedIn', text: '{hook}\n\n{line}: {lines}.\n\n{cta}', tags: '' },
    { id: 'threads', name: 'Threads', text: '{hook} {line} {cta}', tags: '' },
  ];
  const fill = (s, v = {}) => String(s || '').replace(/\{n:(\w+)\}/g, (_, k) => String(v.counts?.[k] ?? '')).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : `{${k}}`));
  // the i-th suggestion for an area (wraps around), filled
  const copyFor = (area, i = 0, vars = {}) => { const l = LINES[area] || LINES[recipeFor(area)?.area?.toLowerCase()] || LINES.chats; return fill(l[((i % l.length) + l.length) % l.length], vars); };
  // area of a recipe id ("lab-sizes" → lab)
  const areaOf = (id) => String(id || '').split('-')[0];

  // ---------- music: cuts on the beat ----------
  const CUT_MODES = [
    { id: 'bars', name: 'Cuts on the bars', every: 4 },
    { id: 'beats', name: 'Cuts on the beats', every: 1 },
    { id: '2bars', name: 'Cuts every 2 bars', every: 8 },
    { id: 'half', name: 'Cuts on half bars', every: 2 },
    { id: 'drop', name: 'The hook ends on the drop', every: 4, drop: true },
    { id: 'free', name: 'Free (no snapping)', every: 0 },
  ];
  const CUT_MODE = Object.fromEntries(CUT_MODES.map((m) => [m.id, m]));
  // Beat lengths moved so every cut lands on the song's grid (from analysis.beats, seconds from the song's start; the
  // edit starts the song at `start`, its first downbeat). Each cut goes to the nearest grid line after the previous
  // one; nothing gets shorter than one grid step. mode "drop": the cut after the first beat lands on the first drop.
  function fitToMusic(beats, analysis, modeId = 'bars') {
    const mode = CUT_MODE[modeId] || CUT_MODE.bars;
    const list = beats.map((b) => ({ ...b }));
    if (!analysis || !mode.every) return { beats: list, start: 0, grid: [] };
    const bpm = analysis.bpm || (analysis.beats?.length > 1 ? 60 / ((analysis.beats.at(-1) - analysis.beats[0]) / (analysis.beats.length - 1)) : 120);
    const spb = 60 / bpm;
    const start = analysis.beats?.length ? analysis.beats[0] : 0;
    // the grid in program time (0 = the song's first beat); extended with the tempo past the analysed part
    const step = spb * mode.every;
    const grid = [];
    const total = list.reduce((s, b) => s + b.secs, 0) + 8;
    for (let t = 0; t <= total + step; t += step) grid.push(r2(t));
    let t = 0;
    const cuts = [];
    let ideal = 0;
    list.forEach((b, i) => {
      ideal += b.secs;
      let want = ideal;
      if (mode.drop && i === 0 && analysis.drops?.length) want = Math.max(analysis.drops[0] - start, step);
      const g = grid.filter((x) => x >= t + step - 1e-6);
      const at = g.length ? g.reduce((p, q) => (Math.abs(q - want) < Math.abs(p - want) ? q : p)) : t + step;
      b.secs = r2(at - t);
      cuts.push(at); t = at;
    });
    return { beats: list, start: r2(start), grid: cuts, bpm: r2(bpm) };
  }

  // ---------- cut-downs: the 15 s and the 6 s ----------
  const CUTDOWNS = [
    { id: '30', secs: 30, name: '30 s (feeds, YouTube)' }, { id: '15', secs: 15, name: '15 s (Reels, Stories)' }, { id: '10', secs: 10, name: '10 s (teaser)' },
    { id: '6', secs: 6, name: '6 s (bumper ad)' }, { id: '3', secs: 3, name: '3 s (sting)' }, { id: 'loop', secs: 6, name: '6 s loop (ends where it starts)', loop: true },
  ];
  // Keep the hook (first) and the end card (last), then the most important beats that fit; the kept beats share the
  // time in their original proportions (≥ 0.6 s each).
  function cutDown(plan, secs) {
    const beats = plan.beats.map((b, i) => ({ ...b, i }));
    if (!beats.length) return { ...plan, secs, beats: [] };
    const first = beats[0]; const last = beats.length > 1 ? beats.at(-1) : null;
    const minEach = 0.6;
    const room = Math.max(1, Math.floor(secs / 1.5));
    const middle = beats.slice(1, last ? -1 : undefined).sort((a, b) => (a.pri || 2) - (b.pri || 2) || a.i - b.i);
    const keep = [first, ...middle.slice(0, Math.max(0, room - (last ? 2 : 1))), ...(last ? [last] : [])].sort((a, b) => a.i - b.i);
    const sum = keep.reduce((s, b) => s + b.secs, 0) || 1;
    const k = secs / sum;
    let out = keep.map((b) => ({ ...b, secs: r2(Math.max(minEach, b.secs * k)) }));
    // rounding / the minimum: the last beat takes the difference
    const diff = r2(secs - out.reduce((s, b) => s + b.secs, 0));
    out[out.length - 1].secs = r2(Math.max(minEach, out[out.length - 1].secs + diff));
    out = out.map(({ i, ...b }) => ({ ...b, from: b.id || i }));
    return { ...plan, secs, beats: out, cutOf: plan.secs };
  }

  // ---------- covers: which frame makes the best thumbnail ----------
  const COVER_MODES = [
    { id: 'best', name: 'The most striking frame (contrast, color, words)' },
    { id: 'hook', name: 'The hook\'s words' },
    { id: 'lab', name: 'The most colorful Lab frame' },
    { id: 'end', name: 'The end card' },
    { id: 'middle', name: 'The middle of the video' },
    { id: 'playhead', name: 'The frame at the playhead' },
  ];
  // stats: { luma (0..1 mean), contrast (0..1 std), sat (0..1), words (bool), black (bool), kind }
  function coverScore(s, mode = 'best') {
    if (!s || s.black) return -1;
    const base = (s.contrast || 0) * 1.4 + (s.sat || 0) + (s.words ? 0.35 : 0) - Math.abs((s.luma ?? 0.45) - 0.45) * 0.8;
    if (mode === 'lab') return s.kind === 'lab' ? base + 1 : base - 1;
    if (mode === 'hook') return s.index === 0 ? base + 2 : base;
    if (mode === 'end') return s.kind === 'end' ? base + 2 : base;
    return r2(base);
  }

  // ---------- the vibe → the video's style (no tokens) ----------
  // summary: BoardVibe.summary(items) (palette [{hex, share}], light, contrast, sat, warmth, motion, pace, moods)
  function vibeStyle(v) {
    if (!v || (!v.palette?.length && v.light == null)) return { trans: null, titles: null, grade: null, accent: '#ffd75e', backdrop: BACKDROPS.dark, energy: null };
    const motion = v.motion ?? 0.4; const sat = v.sat ?? 0.4; const light = v.light ?? 0.4; const warm = v.warmth ?? 0;
    const energy = motion > 0.6 || (v.pace && v.pace < 1.2) ? 'hype' : motion > 0.35 ? 'bold' : 'calm';
    const trans = energy === 'hype' ? 'hype' : energy === 'bold' ? (warm > 0.15 ? 'forge' : 'bold') : light > 0.6 ? 'soft' : 'cinema';
    const titles = light > 0.65 ? 'minimal' : sat > 0.55 ? (warm > 0.1 ? 'forge' : 'neon') : energy === 'hype' ? 'kinetic' : 'giant';
    const grade = light > 0.65 ? 'airy' : light < 0.3 ? (sat > 0.45 ? 'cyberpunk' : 'moody') : sat > 0.55 ? 'vivid' : warm > 0.2 ? 'molten' : warm < -0.2 ? 'teal-orange' : 'punchy';
    const pal = (v.palette || []).map((c) => c.hex).filter(Boolean);
    const lum = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255; };
    const satOf = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; const mx = Math.max(...c); return mx ? (mx - Math.min(...c)) / mx : 0; };
    const accent = [...pal].sort((a, b) => satOf(b) * (0.4 + lum(b)) - satOf(a) * (0.4 + lum(a)))[0] || '#ffd75e';
    const backdrop = [...pal].sort((a, b) => lum(a) - lum(b))[0] || BACKDROPS.dark;
    return { trans, titles, grade, accent, backdrop: lum(backdrop) < 0.25 ? backdrop : light > 0.65 ? BACKDROPS.light : BACKDROPS.dark, energy };
  }
  // The idea a Lab beat's jam starts from: the beat's scene + the vibe in a few words (jam ideas are ≤ 200 chars)
  function sceneIdea(beat, vibe = {}, { fmt = '9:16' } = {}) {
    const pal = (vibe.palette || []).slice(0, 3).join(' ');
    const moods = (vibe.moods || []).slice(0, 3).join(', ');
    const bits = [beat.scene || beat.words || 'a striking visual', moods && `vibe: ${moods}`, pal && `palette ${pal}`, `${beat.secs}s, ${fmt}`];
    const s = bits.filter(Boolean).join(' · ');
    return s.length > 200 ? `${s.slice(0, 199)}…` : s;
  }

  // ---------- the plan ----------
  const uid = (() => { let n = 0; return () => `b${Date.now().toString(36)}${(n += 1).toString(36)}`; })();
  // opts: { template, secs, formats, name, tagline, cta, hook, vibe (BoardVibe summary), style (vibeStyle), counts }
  function makePlan(opts = {}) {
    const t = findTemplate(opts.template) || TEMPLATE['product-intro'];
    const name = opts.name || 'Hearth';
    const vars = { name, tagline: opts.tagline || TAGLINES[0], cta: opts.cta || CTAS[0], hook: fill(opts.hook || HOOKS[1], { name }), counts: opts.counts || {} };
    const want = clamp(Number(opts.secs) || t.secs, 2, 120);
    const k = want / t.secs;
    let beats = t.beats.map((b, i) => {
      const x = { ...b, id: uid(), n: i + 1, secs: r2(Math.max(0.6, b.secs * k)) };
      if (x.kind === 'stat') { const s = STAT[x.stat] || STATS[0]; const n = vars.counts[s.id]; x.words = n ? `${n}` : x.words || s.label; x.sub = b.words ? fill(b.words, vars) : s.label; }
      else if (x.words) x.words = fill(x.words, vars);
      else if (x.kind === 'tour' || x.kind === 'shot') x.words = copyFor(areaOf(x.area), i, vars);
      if (x.sub) x.sub = fill(x.sub, vars);
      if (x.kind === 'tour' || x.kind === 'shot') x.area = x.area || 'chats';
      return x;
    });
    // the ends land on the exact length asked for
    const diff = r2(want - beats.reduce((s, b) => s + b.secs, 0));
    if (beats.length) beats[beats.length - 1].secs = r2(Math.max(0.6, beats.at(-1).secs + diff));
    const fmts = (opts.formats?.length ? opts.formats : t.fmts).map(parseFormat).filter(Boolean);
    const vs = opts.style || vibeStyle(opts.vibe);
    beats = beats.map((b, i) => ({ ...b, n: i + 1 }));
    return {
      template: t.id, templateName: t.name, name, vars: { tagline: vars.tagline, cta: vars.cta, hook: vars.hook }, secs: r2(want),
      formats: fmts.length ? [...new Set(fmts)] : ['9:16'], loop: Boolean(t.loop),
      style: { trans: opts.trans || vs.trans || t.trans, titles: opts.titles || vs.titles || t.titles, grade: opts.grade || vs.grade || t.grade, accent: vs.accent || '#ffd75e', backdrop: vs.backdrop || BACKDROPS.dark },
      beats,
    };
  }
  const total = (plan) => r2(plan.beats.reduce((s, b) => s + b.secs, 0));
  // Rescale a plan to a new length (proportional; the ends keep at least 0.6 s)
  function retime(plan, secs) {
    const sum = total(plan) || 1; const k = secs / sum;
    const beats = plan.beats.map((b) => ({ ...b, secs: r2(Math.max(0.6, b.secs * k)) }));
    const diff = r2(secs - beats.reduce((s, b) => s + b.secs, 0));
    if (beats.length) beats[beats.length - 1].secs = r2(Math.max(0.6, beats.at(-1).secs + diff));
    return { ...plan, secs: r2(secs), beats };
  }
  // A beat of a new kind in place of another (same length and words)
  function swapKind(beat, kind, { area } = {}) {
    if (!KINDS[kind]) return beat;
    const b = { ...beat, kind };
    if (kind === 'tour' || kind === 'shot') b.area = area || beat.area || 'chats';
    if (kind === 'lab') b.scene = beat.scene || beat.words || 'a striking visual';
    return b;
  }
  // The plan as a few lines (the card's fold, prompts, /intro plan): ≈ 20 tokens a beat
  function planText(plan, { short = false } = {}) {
    const head = `${plan.name} · ${plan.templateName || plan.template} · ${total(plan)} s · ${plan.formats.join(' ')} · ${plan.style.titles} titles, ${plan.style.trans} cuts, ${plan.style.grade} grade${plan.loop ? ' · loops' : ''}`;
    if (short) return head;
    return [head, ...plan.beats.map((b) => `${b.n}. ${KINDS[b.kind]?.label || b.kind} ${b.secs}s${b.area ? ` [${b.area}]` : ''}${b.scene && b.kind === 'lab' ? ` (${b.scene})` : ''}${b.words ? ` “${b.words}”` : ''}${b.sub ? ` / ${b.sub}` : ''}`)].join('\n');
  }
  // Astra decides the details: "template: <id>", "hook: <words>", "end: <words>", "length: <s>" lines (any order)
  function parseDecision(text) {
    const out = {};
    for (const raw of String(text || '').split('\n')) {
      const m = raw.replace(/^[-*\s]+/, '').match(/^(template|hook|end|length|line|tagline|cta|formats?|titles|cuts|transitions|grade)\s*[:=]\s*(.+)$/i);
      if (!m) continue;
      const k = m[1].toLowerCase(); const v = m[2].trim().replace(/^["“]|["”]$/g, '');
      if (k === 'template') { const t = findTemplate(v); if (t) out.template = t.id; }
      else if (k === 'length') { const n = parseFloat(v); if (n >= 2 && n <= 120) out.secs = n; }
      else if (k.startsWith('format')) { const f = v.split(/[\s,]+/).map(parseFormat).filter(Boolean); if (f.length) out.formats = [...new Set(f)]; }
      else if (k === 'titles') { const x = TITLE_LOOKS.find((l) => l.id === v.toLowerCase() || l.name.toLowerCase() === v.toLowerCase()); if (x) out.titles = x.id; }
      else if (k === 'cuts' || k === 'transitions') { const x = TRANSITION_SETS.find((l) => l.id === v.toLowerCase().split(/[\s:]/)[0]); if (x) out.trans = x.id; }
      else if (k === 'grade') { if (GRADES.includes(v.toLowerCase())) out.grade = v.toLowerCase(); }
      else out[k === 'line' ? 'tagline' : k] = v.slice(0, 60);
    }
    return out;
  }
  // The words of every beat rewritten by Astra: "3 | new words" lines
  function parseWords(text, beats) {
    const out = {};
    for (const raw of String(text || '').split('\n')) {
      const m = raw.match(/^\s*(\d+)\s*[|:.)-]\s*(.+)$/);
      if (m && beats.some((b) => b.n === Number(m[1]))) out[Number(m[1])] = m[2].trim().replace(/^["“]|["”]$/g, '').slice(0, 60);
    }
    return out;
  }
  // Review notes "m:ss | note" → [{ t, note }]
  function parseNotes(text) {
    const out = [];
    for (const raw of String(text || '').split('\n')) {
      const m = raw.match(/^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*\|\s*(.+)$/);
      if (m) out.push({ t: (Number(m[1]) || 0) * 60 + Number(m[2]), note: m[3].trim().slice(0, 140) });
    }
    return out.slice(0, 8);
  }
  // where each beat starts in the program (transitions overlap the cut like xfade: td is taken from the start)
  function starts(beats, transDur = 0) {
    let t = 0;
    return beats.map((b, i) => { const td = i ? Math.min(transDur, b.secs * 0.45, beats[i - 1].secs * 0.45) : 0; const s = r2(t - td); t = s + b.secs; return s; });
  }

  // ---------- the steps of a project ----------
  const STEPS = [
    { id: 'plan', name: 'Plan', icon: '☰', what: 'beats, length and formats' },
    { id: 'vibe', name: 'Vibe', icon: '◐', what: 'read from the linked mood board (never its footage)' },
    { id: 'scenes', name: 'Scenes', icon: '✦', what: 'Claude ⇄ Astra jam a Lab scene per visual beat' },
    { id: 'captures', name: 'Captures', icon: '◉', what: 'Hearth filmed by capture tours, Lab scenes recorded' },
    { id: 'edit', name: 'Edit', icon: '✂', what: 'assembled in the editor: titles, transitions, grade, music' },
    { id: 'review', name: 'Review', icon: '⌕', what: 'frame-exact checks, a contact sheet, notes on the timeline' },
    { id: 'render', name: 'Render', icon: '⇪', what: 'every format, with a cover each' },
  ];
  const STEP = Object.fromEntries(STEPS.map((s, i) => [s.id, { ...s, i }]));

  return {
    FORMATS, FORMAT, parseFormat, KINDS, TRANSITION_SETS, TITLE_LOOKS, GRADES, BACKDROPS, TEMPLATES, TEMPLATE, findTemplate,
    RECIPES, RECIPE, recipeFor, tourText, SHOT_TARGET, SHOT_OPEN, HOOKS, TAGLINES, CTAS, LINES, STATS, STAT, featureLines, POSTS, fill, copyFor, areaOf,
    CUT_MODES, CUT_MODE, fitToMusic, CUTDOWNS, cutDown, COVER_MODES, coverScore, vibeStyle, sceneIdea,
    makePlan, total, retime, swapKind, planText, parseDecision, parseWords, parseNotes, starts, STEPS, STEP, slug, r2,
  };
})();
if (typeof module !== 'undefined') module.exports = IntroData;
