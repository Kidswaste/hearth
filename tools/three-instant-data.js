// "Describe it" (round 29, instantscene): the hand-written vocabulary that turns a sentence into a scene with no model
// call. Each word (or short phrase) says what it means for the Lab: tags that search the gallery and the library,
// a mood, the kind of layer it wants, a speed or intensity factor, a look (◐ Grade preset id), a palette family, a
// music reaction (labaudio's reaction preset id) or colors. tools/three-instant-core.js reads a sentence with it and
// scores everything Hearth already has (tools/three-instant.js shows the 3 picks). Plain data: loads in Node too.
//   entry: { tags, mood, kind: start | particles | physics | type | lib, speed ×, intensity ×, grade, pal, react,
//            feature (a sound the reaction follows), verb (what the music does), color, still (no music) }
const InstantData = (() => {
  // color words → a color (the palette is made from these, and the library's palettes are ranked against them)
  const COLORS = {
    pink: '#ff5fa8', 'hot-pink': '#ff2d95', magenta: '#ff1fd0', fuchsia: '#ff1fd0', rose: '#ff7aa2', blush: '#ffc2d1',
    red: '#ff2a3d', crimson: '#d6143a', scarlet: '#ff3b1f', coral: '#ff7f61', salmon: '#ff9478', peach: '#ffb38a',
    orange: '#ff7a1a', amber: '#ffb000', gold: '#ffc23d', golden: '#ffc23d', yellow: '#ffe53d', lemon: '#fff35c', cream: '#f6ecd2',
    lime: '#a8ff2b', green: '#2bd96b', emerald: '#10b97a', mint: '#8ff0c4', jade: '#2fa37a', olive: '#7d8a2b', forest: '#1f6b3a',
    teal: '#14c8b8', turquoise: '#2be0d0', aqua: '#3df0ff', cyan: '#2bd9ff', sky: '#7cc8ff', blue: '#2b6bff', cobalt: '#1f4fd6',
    navy: '#0e1f5c', indigo: '#4b2bd6', purple: '#8a2bff', violet: '#9b5cff', lavender: '#c3a6ff', lilac: '#d3b3ff', plum: '#6b1f5c',
    white: '#f4f4f8', silver: '#c8ccd6', grey: '#8a8f99', gray: '#8a8f99', black: '#060608', brown: '#7a4a2b', copper: '#c46a3a',
    bronze: '#b0793a', chocolate: '#4a2a18', ivory: '#fffbe8', pearl: '#efe9f2',
  };
  // short phrases read as one word (before the words are split)
  const PHRASES = [
    ['hi hats', 'hats'], ['hi hat', 'hats'], ['hi-hats', 'hats'], ['hi-hat', 'hats'], ['high hats', 'hats'],
    ['black and white', 'bw'], ['black & white', 'bw'], ['b&w', 'bw'], ['b/w', 'bw'], ['monochrome', 'bw'],
    ['lo fi', 'lofi'], ['lo-fi', 'lofi'], ['slow motion', 'slowmo'], ['slow-mo', 'slowmo'], ['hot pink', 'hot-pink'],
    ['northern lights', 'aurora'], ['light leaks', 'lightleak'], ['film grain', 'grain'], ['super 8', 'super8'], ['8mm', 'super8'],
    ['no music', 'nomusic'], ['not reactive', 'nomusic'], ['no reaction', 'nomusic'], ['without music', 'nomusic'], ['no audio', 'nomusic'], ['not reacting', 'nomusic'],
    ['the drop', 'drop'], ['80s', 'eighties'], ['1980s', 'eighties'], ['70s', 'seventies'], ['90s', 'nineties'], ['y2k', 'y2k'],
    ['sci fi', 'scifi'], ['sci-fi', 'scifi'], ['3 d', '3d'], ['three d', '3d'], ['vapor wave', 'vaporwave'], ['synth wave', 'synthwave'],
    ['music video', 'musicvideo'], ['night club', 'club'], ['mirror ball', 'disco'], ['disco ball', 'disco'], ['black hole', 'blackhole'],
    ['lava lamp', 'lava'], ['joy division', 'pulsar'], ['unknown pleasures', 'pulsar'], ['out now', 'release'], ['deep space', 'space'],
  ];
  const W = {};
  const def = (words, e) => { for (const w of words.split(' ')) W[w] = { ...(W[w] || {}), ...e }; };
  const thing = (words, e) => def(words, { ...e, subj: true }); // what the scene IS weighs more than how it feels

  // ---------- what it is (tags search names, tags and descriptions; kind prefers a layer family) ----------
  thing('tunnel tunnels wormhole corridor portal', { tags: 'tunnel warp rings' });
  thing('warp hyperspace lightspeed', { tags: 'warp speed stars hyperspace tunnel', speed: 1.3 });
  thing('chrome chromed metallic metal mirror reflective', { tags: 'chrome metal reflective glossy', mood: 'chrome' });
  thing('liquid fluid molten melting', { tags: 'liquid fluid blob gradient flow' });
  thing('blob blobs goo jelly', { tags: 'blob jelly liquid' });
  thing('gold golden luxury luxurious', { tags: 'gold warm luxury' });
  thing('glass glassy crystal', { tags: 'glass crystal 3d' });
  thing('grid grids', { tags: 'grid synthwave retro' });
  thing('sun sunset sunrise dusk', { tags: 'sun sunset vapor dusk', pal: 'Warm' });
  thing('mountains mountain terrain landscape', { tags: 'terrain mountains wireframe' });
  thing('galaxy galaxies cosmos cosmic universe', { tags: 'galaxy stars space spiral', kind: 'particles' });
  thing('space stars starry starfield', { tags: 'stars space galaxy warp', mood: 'dark' });
  thing('nebula', { tags: 'nebula space clouds gas', kind: 'particles' });
  thing('blackhole', { tags: 'black hole space', kind: 'particles' });
  thing('comet comets meteor', { tags: 'comet space', kind: 'particles' });
  thing('particles particle dust sparkles glitter', { tags: 'particles burst dust', kind: 'particles' });
  thing('confetti party celebration', { tags: 'confetti party', kind: 'particles' });
  thing('sparks spark', { tags: 'sparks particles burst', kind: 'particles' });
  thing('fire flames flame burning inferno', { tags: 'fire embers flames burst', kind: 'particles', pal: 'Warm' });
  thing('embers ember ash', { tags: 'embers fire particles', kind: 'particles', pal: 'Warm' });
  thing('smoke fog haze mist', { tags: 'smoke haze fog', kind: 'particles' });
  thing('snow snowy winter', { tags: 'snow', kind: 'particles', pal: 'Cool' });
  thing('rain rainy storm', { tags: 'rain storm', kind: 'particles', pal: 'Cool' });
  thing('bubbles bubble underwater', { tags: 'bubbles water', kind: 'particles' });
  thing('fireflies firefly', { tags: 'fireflies night', kind: 'particles' });
  thing('tornado vortex whirlwind', { tags: 'tornado vortex swirl', kind: 'particles' });
  thing('swarm flock birds', { tags: 'swarm flock', kind: 'particles' });
  thing('ribbons ribbon trails', { tags: 'ribbons flow trails', kind: 'particles' });
  thing('fountain', { tags: 'fountain', kind: 'particles' });
  thing('shockwave shockwaves ripple ripples', { tags: 'shockwave rings', kind: 'particles' });
  thing('explosion explode exploding burst bursts', { tags: 'burst explode particles', intensity: 1.3 });
  thing('aurora', { tags: 'aurora northern lights', mood: 'dreamy' });
  thing('bokeh', { tags: 'bokeh lights blur', mood: 'dreamy' });
  thing('gradient gradients', { tags: 'gradient mesh flow' });
  thing('paint ink watercolor', { tags: 'ink paint swirl gradient fluid' });
  thing('ocean sea water waves wave', { tags: 'ocean water wave liquid', pal: 'Cool' });
  thing('lines line waveform', { tags: 'lines waveform pulsar' });
  thing('pulsar', { tags: 'pulsar lines joy division', mood: 'dark', grade: 'noir' });
  thing('spiral spirals hypnotic hypno swirl', { tags: 'spiral hypnotic swirl', mood: 'dark' });
  thing('fractal fractals mandelbrot julia kaleidoscope', { tags: 'fractal zoom julia trippy', mood: 'dark' });
  thing('trippy psychedelic acid', { tags: 'trippy fractal spiral hypnotic', grade: 'neon', pal: 'Neon' });
  thing('lasers laser beams beam', { tags: 'laser beams club', mood: 'club' });
  thing('disco', { tags: 'disco mirror ball spotlights', mood: 'chrome' });
  thing('spotlight spotlights', { tags: 'spotlight light beams' });
  thing('knot torus donut', { tags: 'knot torus' });
  thing('sphere orb ball', { tags: 'sphere ball blob orb' });
  thing('cube cubes boxes blocks', { tags: 'cube box blocks', kind: 'physics' });
  thing('spectrum equalizer eq bars visualizer', { tags: 'spectrum bars equalizer visualizer' });
  thing('ring rings circle halo crown', { tags: 'ring circle halo spectrum' });
  thing('glitch glitchy corrupted datamosh', { tags: 'glitch rgb digital', grade: 'neon' });
  thing('crt arcade scanlines', { tags: 'crt arcade scanlines retro', mood: 'neon' });
  thing('vhs tape', { tags: 'vhs retro crt grain', grade: 'vintage' });
  thing('text type title titles typography words word letters lettering', { tags: 'type text title words', kind: 'type', mood: 'type' });
  thing('lyrics', { tags: 'lyrics words text', kind: 'type', mood: 'type' });
  thing('intro opener opening', { tags: 'opener intro title kinetic', mood: 'type' });
  thing('release poster promo announcement event', { tags: 'release poster promo event announcement title', mood: 'type' });
  thing('kinetic', { tags: 'kinetic type opener' });
  thing('typewriter typed', { tags: 'typewriter typed', kind: 'type' });
  thing('physics bouncing bounce balls bouncy gravity', { tags: 'physics bounce balls', kind: 'physics' });
  thing('dominoes domino', { tags: 'domino run', kind: 'physics' });
  thing('cloth flag curtain fabric', { tags: 'cloth flag curtain', kind: 'physics' });
  thing('pendulum pendulums', { tags: 'pendulum wave', kind: 'physics' });
  thing('balloons balloon', { tags: 'balloons', kind: 'physics' });
  thing('tower topple collapse', { tags: 'tower topples drop', kind: 'physics' });
  thing('3d', { tags: '3d' });

  // ---------- moods and styles (a mood, a look, a palette family; some move speed / intensity) ----------
  def('dreamy dream dreamlike ethereal heavenly', { tags: 'dreamy soft bokeh calm', mood: 'dreamy', speed: 0.8, intensity: 0.85, grade: 'golden', pal: 'Pastel' });
  def('soft gentle delicate', { tags: 'soft', mood: 'dreamy', intensity: 0.75 });
  def('pastel pastels', { tags: 'pastel soft', mood: 'dreamy', pal: 'Pastel' });
  def('calm chill relaxing peaceful serene ambient', { tags: 'calm chill ambient', mood: 'dreamy', speed: 0.6, intensity: 0.75 });
  def('lofi', { tags: 'lofi chill pastel', mood: 'dreamy', speed: 0.6, grade: 'vintage', pal: 'Pastel' });
  def('neon glowing glow electric', { tags: 'neon glow', mood: 'neon', intensity: 1.15, grade: 'neon', pal: 'Neon' });
  def('cyberpunk cyber futuristic', { tags: 'cyber neon glitch digital', mood: 'neon', grade: 'neon', pal: 'Neon' });
  def('retro synthwave outrun eighties vaporwave vapor', { tags: 'synthwave retro grid sun vapor 80s', mood: 'neon', grade: 'neon', pal: 'Neon' });
  def('seventies', { tags: 'retro warm', grade: 'vintage', pal: 'Retro' });
  def('nineties', { tags: 'retro vhs', grade: 'vintage', pal: 'Retro' });
  def('y2k', { tags: 'chrome y2k glossy', mood: 'chrome', grade: 'commercial' });
  def('dark moody gloomy sinister eerie ominous', { tags: 'dark', mood: 'dark', intensity: 0.9, grade: 'night', pal: 'Mono' });
  def('hypnotizing mesmerizing mesmerising', { tags: 'hypnotic spiral', mood: 'dark' });
  def('minimal minimalist simple clean', { tags: 'minimal lines', intensity: 0.7, grade: 'commercial' });
  def('club rave party dancefloor techno house edm', { tags: 'club rave lasers burst', mood: 'club', intensity: 1.25, grade: 'neon', pal: 'Genre' });
  def('energetic energy hype hyped banger', { tags: 'burst energy', mood: 'club', speed: 1.35, intensity: 1.35 });
  def('epic cinematic movie film trailer', { tags: 'cinematic', grade: 'blockbuster' });
  def('analog analogue', { tags: 'film grain', grade: 'print' });
  def('vintage old retro-film nostalgic faded', { tags: 'vintage grain', grade: 'vintage', pal: 'Retro' });
  def('super8 homevideo', { tags: 'vintage grain', grade: 'super8', pal: 'Retro' });
  def('bw noir', { tags: 'black white minimal', grade: 'noir', pal: 'Mono' });
  def('sepia', { tags: 'old', grade: 'sepia', pal: 'Retro' });
  def('matrix hacker code terminal', { tags: 'matrix digital code', grade: 'matrix' });
  def('scifi alien', { tags: 'space scifi', grade: 'scifi', pal: 'Cool' });
  def('cold icy frozen ice arctic', { tags: 'ice cold', grade: 'scifi', pal: 'Cool' });
  def('warm cozy cosy', { tags: 'warm', grade: 'kodak', pal: 'Warm' });
  def('sunny summer summery tropical', { tags: 'sun warm', grade: 'golden', pal: 'Warm' });
  def('night midnight nocturnal moonlight moonlit', { tags: 'night stars', mood: 'dark', grade: 'night', pal: 'Cool' });
  def('nature natural organic forest', { tags: 'nature', pal: 'Nature' });
  def('fresh crisp', { grade: 'fuji' });
  def('gritty raw harsh grimy', { tags: 'grain', grade: 'bleach', intensity: 1.15 });
  def('glossy shiny polished sleek', { tags: 'glossy chrome', mood: 'chrome', grade: 'commercial' });
  def('musicvideo', { grade: 'neon' });
  def('elegant classy', { tags: 'gold luxury', grade: 'print', intensity: 0.85 });
  def('colorful colourful vibrant rainbow saturated', { tags: 'colorful', intensity: 1.15, pal: 'Pastel rainbow' });
  def('grain grainy', { tags: 'grain', grade: 'print' });
  def('lightleak', { tags: 'light leaks', grade: 'vintage' });

  // ---------- speed and intensity ----------
  def('slow slowly slowmo lazy floating drifting drift', { speed: 0.5 });
  def('slower', { speed: 0.4 });
  def('steady smooth', { speed: 0.85 });
  def('fast quick quickly rapid speedy speeding racing rushing', { speed: 1.7 });
  def('faster', { speed: 2 });
  def('frantic frenetic crazy chaotic manic', { speed: 2.2, intensity: 1.5 });
  def('subtle understated quiet', { intensity: 0.6 });
  def('intense aggressive hard heavy punchy powerful violent', { intensity: 1.5 });
  def('wild insane massive huge big', { intensity: 1.35 });
  def('bright brighter', { intensity: 1.2 });

  // ---------- the music: what it follows (feature) and what it does (verb) ----------
  def('kick kicks drum drums bassdrum', { feature: 'kick' });
  def('snare snares clap claps', { feature: 'snare' });
  def('hats hat cymbal cymbals shaker shakers', { feature: 'hats' });
  def('drop drops', { feature: 'drop' });
  def('build builds buildup riser', { feature: 'build' });
  def('bass sub bassline', { feature: 'bass' });
  def('vocals vocal voice singing singer', { feature: 'vocals' });
  def('beat beats tempo rhythm bpm', { feature: 'beat' });
  def('loud loudness volume', { feature: 'loud' });
  def('pulse pulses pulsing pulsate pump pumps pumping throb throbs bump bumps', { verb: 'pump' });
  def('react reacts reacting reactive reactivity follows dance dances dancing', { verb: 'pump' });
  def('flash flashes flashing strobe strobes strobing blink blinks', { verb: 'flash', intensity: 1.1 });
  def('spin spins spinning rotate rotates rotating turn turns turning', { verb: 'spin' });
  def('breathe breathes breathing swell swells', { verb: 'breathe' });
  def('shake shakes shaking jitter jitters', { verb: 'shake' });
  def('wobble wobbles wobbly', { verb: 'wobble' });
  def('zoom zooms zooming', { verb: 'zoom' });
  def('nomusic static', { still: true });

  // which reaction preset (tools/three-audio-map.js) a sound + a verb make
  const REACT = {
    kick: { pump: 'pump-kick', flash: 'pump-kick', spin: 'pump-kick', breathe: 'pump-kick', shake: 'pump-kick', zoom: 'pump-kick', wobble: 'pump-kick', _: 'pump-kick' },
    snare: { _: 'shake-snare' }, hats: { flash: 'strobe-hats', _: 'glow-hats' }, drop: { _: 'zoom-drops' }, build: { _: 'rise-builds' },
    bass: { _: 'wobble-sub' }, vocals: { _: 'follow-vocals' }, beat: { _: 'step-beat' }, loud: { _: 'breathe-loud' },
    _: { pump: 'pump-kick', flash: 'strobe-hats', spin: 'spin-flux', breathe: 'breathe-loud', shake: 'shake-snare', wobble: 'wobble-sub', zoom: 'zoom-drops' },
  };
  // how much a word in front changes the next speed / intensity word (×: the factor's distance from 1)
  const BOOST = { very: 1.5, super: 1.6, really: 1.4, extremely: 1.8, ultra: 1.8, so: 1.3, too: 1.2, way: 1.5, mega: 1.7 };
  const DAMP = { slightly: 0.4, bit: 0.5, little: 0.5, kinda: 0.6, somewhat: 0.6, fairly: 0.7, mildly: 0.5 };
  const NOT = new Set(['no', 'not', 'without', 'never', 'dont', "don't", 'nothing', 'less']);
  // words that carry no meaning here
  const STOP = new Set(('a an the and or but of in on at to for with from like something some me my it its this that these those make made '
    + 'start starting want please kind sort is are be being was has have give scene visual visuals video loop thing one look looking feel feeling '
    + 'vibe vibes style styled type-of i we you can could would should which who where when then than as by into onto over under up down out off '
    + 'all any each every more most much lot lots just also maybe while whole full mostly mainly').split(/\s+/));
  // the gallery's moods, as words someone might use
  const MOODS = { neon: 'Neon & retro', chrome: 'Chrome & glossy', dreamy: 'Soft & dreamy', dark: 'Dark & hypnotic', club: 'Club energy', type: 'Type openers' };
  return { COLORS, PHRASES, WORDS: W, REACT, BOOST, DAMP, NOT, STOP, MOODS };
})();
if (typeof module !== 'undefined') module.exports = InstantData;
