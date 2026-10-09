// Sequence templates (seq2): the shapes ✦ Arrange builds a Lab sequence from (tools/three-seq-arrange.js). Pure data.
//   secs      a target length (null: the song's sections decide; capped by max)
//   window    where in the song a short one sits: 'start' · 'drop' (the first drop at dropAt of the length) · 'loud'
//   pace      bars per clip in each kind of section (with a song); secs per clip without one (paceSecs)
//   within    the transition between two clips of the same section; into: on a section change (by the new section)
//   vary      how different a scene looks when it comes back in another section (0 = the same, 1 = anything)
//   titles    { at: 'start' | 'end' | 'drop', text ({name} = the sequence, {song} = the song), style, anim, bars }
//   lines     'lyric' (each line you give is a title, in time) · 'items' (one item per clip, a lower third)
//   bookend   the last clip comes back to the first scene · loop: it ends where it starts (⟲ Loop on)
const SeqTemplates = (() => {
  const SMOOTH = { Intro: 'dissolve', Build: 'push-left', Drop: 'cut', Break: 'dissolve', Outro: 'slow-dissolve' };
  const INTO = { Intro: 'dissolve', Build: 'lab-fly', Drop: 'lab-flash-beat', Break: 'dip-black', Outro: 'lab-morph' };
  const T = (id, name, desc, o) => ({ id, name, desc, secs: null, max: 60, window: 'drop', dropAt: 0.4, pace: { Intro: 4, Build: 2, Drop: 1, Break: 4, Outro: 4 }, paceSecs: 2.5, within: SMOOTH, into: INTO, vary: 0.4, titles: [], ...o });
  const TEMPLATES = [
    T('music-video', 'Music video', 'The whole song: calm intro, cuts every bar on the drop, a slow outro', { secs: null, max: 600, window: 'start', pace: { Intro: 4, Build: 2, Drop: 1, Break: 4, Outro: 8 }, bookend: true }),
    T('product-intro', 'Product intro', '30 s: a title, the build, the drop with the product name, an end card', { secs: 30, window: 'drop', dropAt: 0.45, pace: { Intro: 4, Build: 2, Drop: 2, Break: 4, Outro: 4 }, titles: [{ at: 'start', text: '{name}', style: 'bold', anim: 'fade-up', bars: 2 }, { at: 'drop', text: '{name}', style: 'neon', anim: 'pop', bars: 2 }, { at: 'end', text: 'Made with Hearth', style: 'thin', anim: 'fade', bars: 2 }] }),
    T('teaser', 'Teaser (15 s)', '15 s around the first drop: a short build, fast cuts, a hard stop', { secs: 15, window: 'drop', dropAt: 0.35, pace: { Intro: 2, Build: 1, Drop: 1, Break: 2, Outro: 2 }, into: { ...INTO, Outro: 'dip-black' }, titles: [{ at: 'end', text: '{name}', style: 'bold', anim: 'pop', bars: 1 }] }),
    T('bumper', 'Bumper (6 s)', '6 s: one hit, two or three scenes, the name', { secs: 6, window: 'drop', dropAt: 0.25, pace: { Intro: 1, Build: 1, Drop: 1, Break: 1, Outro: 1 }, paceSecs: 2, titles: [{ at: 'end', text: '{name}', style: 'bold', anim: 'pop', bars: 1 }] }),
    T('loop', 'Seamless loop', 'A few bars that end where they start (for a background or a post that loops)', { secs: 16, window: 'loud', pace: { Intro: 2, Build: 2, Drop: 2, Break: 2, Outro: 2 }, paceSecs: 3, within: { ...SMOOTH, Drop: 'lab-morph' }, into: { ...INTO, Drop: 'lab-morph' }, loop: true, bookend: true }),
    T('lyric', 'Lyric video', 'Slow scenes, one line of text per two bars (give the lines, or edit the placeholders)', { secs: null, max: 120, window: 'start', pace: { Intro: 8, Build: 4, Drop: 4, Break: 8, Outro: 8 }, within: { ...SMOOTH, Drop: 'dissolve' }, lines: 'lyric', vary: 0.25 }),
    T('changelog', 'Changelog', 'One scene per item with its text as a lower third (give the items)', { secs: null, max: 90, window: 'start', pace: { Intro: 4, Build: 4, Drop: 4, Break: 4, Outro: 4 }, paceSecs: 3.5, within: { Intro: 'push-left', Build: 'push-left', Drop: 'push-left', Break: 'push-left', Outro: 'dissolve' }, lines: 'items', titles: [{ at: 'start', text: "What's new", style: 'bold', anim: 'fade-up', bars: 2 }] }),
    T('reel', 'Reel (30 s, fast)', '30 s of fast cuts on the beat, every transition a Lab move', { secs: 30, window: 'drop', dropAt: 0.3, pace: { Intro: 2, Build: 1, Drop: 1, Break: 2, Outro: 2 }, within: { Intro: 'lab-depth', Build: 'whip-left', Drop: 'cut', Break: 'lab-mosh', Outro: 'lab-morph' }, vary: 0.55 }),
    T('mood', 'Slow mood', 'Long scenes melting into each other, no hard cuts', { secs: null, max: 90, window: 'start', pace: { Intro: 8, Build: 8, Drop: 4, Break: 8, Outro: 8 }, paceSecs: 6, within: { Intro: 'slow-dissolve', Build: 'lab-morph', Drop: 'lab-morph', Break: 'slow-dissolve', Outro: 'slow-dissolve' }, into: { Intro: 'slow-dissolve', Build: 'lab-fly', Drop: 'lab-bloom', Break: 'slow-dissolve', Outro: 'lab-morph' }, vary: 0.25 }),
    T('drop-showcase', 'Drop showcase', 'Just the drop: every scene once, a cut on every bar, a flash on each section', { secs: 20, window: 'drop', dropAt: 0.1, pace: { Intro: 1, Build: 1, Drop: 1, Break: 1, Outro: 1 }, within: { Intro: 'cut', Build: 'cut', Drop: 'lab-stutter', Break: 'cut', Outro: 'cut' }, vary: 0.6 }),
  ];
  const BY = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
  // "product intro", "15 s", "lyrics" → a template
  function find(q) {
    if (!q) return null;
    const s = String(q).toLowerCase().trim();
    if (BY[s]) return BY[s];
    if (/^15\s*s?$/.test(s)) return BY.teaser;
    if (/^6\s*s?$/.test(s)) return BY.bumper;
    const words = s.split(/[\s-]+/).filter(Boolean);
    return TEMPLATES.find((t) => t.name.toLowerCase().startsWith(s)) || TEMPLATES.find((t) => words.every((w) => `${t.id} ${t.name} ${t.desc}`.toLowerCase().includes(w.replace(/s$/, '')))) || null;
  }
  return { TEMPLATES, BY, find, DEFAULT: 'music-video' };
})();
if (typeof module !== 'undefined') module.exports = SeqTemplates;
