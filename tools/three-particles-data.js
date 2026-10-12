// ✦ GPU particles (round 24, particles): the sliders a particle layer can have and the presets (one searchable list:
// /particles, the FX picker's "Particles" category, three_do particles list). A preset is the sliders it shows (with
// its values) + the options that set its emitter and look; tools/three-particles.js turns one into layer code that
// calls particles(P, opts) (the runtime: tools/three-sandbox.html "GPU particles").
// react: reaction mappings (/react-to) a preset suggests; they're applied only when asked (/particles react), so a
// new layer moves on the timeline by itself and follows the music only when the owner wants it to.
const ParticleData = (() => {
  // key → tweak spec. Groups match the Lab's slider groups.
  const SLIDERS = {
    count: { value: 100, min: 1, max: 2000, step: 1, label: 'Particles (thousands)', group: 'Particles', hint: 'On the GPU: 100–2000 thousand on a real graphics card; the preview draws fewer when frames drop, renders draw all' },
    emit: { value: 1, min: 0, max: 1, label: 'Emission', group: 'Particles', hint: 'How many are born all the time (0: only bursts)' },
    life: { value: 4, min: 0.2, max: 60, label: 'Life (s)', group: 'Particles', hint: '60 = they live forever' },
    lifeVar: { value: 0.5, min: 0, max: 0.95, label: 'Life variety', group: 'Particles' },
    look: { value: 'points', options: ['points', 'streak', 'mesh'], label: 'Drawn as', group: 'Look' },
    sprite: { value: 'soft', options: ['soft', 'dot', 'ring', 'star', 'square'], label: 'Sprite', group: 'Look' },
    blend: { value: 'add', options: ['add', 'alpha'], label: 'Blend', group: 'Look', hint: 'add: glowing light · alpha: solid things (smoke, snow, confetti)' },
    size: { value: 0.035, min: 0.002, max: 0.4, label: 'Size', group: 'Look' },
    sizeEnd: { value: 0.4, min: 0, max: 4, label: 'Size at the end', group: 'Look', hint: 'Size over life: × this when it dies' },
    sizeVar: { value: 0.5, min: 0, max: 1, label: 'Size variety', group: 'Look' },
    opacity: { value: 0.85, min: 0, max: 1, label: 'Opacity', group: 'Look' },
    fadeIn: { value: 0.08, min: 0, max: 0.6, label: 'Fade in', group: 'Look' },
    fadeOut: { value: 0.5, min: 0, max: 1, label: 'Fade out', group: 'Look' },
    trail: { value: 0, min: 0, max: 0.98, label: 'Trails', group: 'Look', hint: 'The last frames stay and fade (feedback)' },
    streak: { value: 0.15, min: 0, max: 1, label: 'Streak length', group: 'Look', hint: 'Streaks: stretched along their speed' },
    color1: { value: '#ffd27a', label: 'Color at birth', group: 'Color' },
    color2: { value: '#ff6a3d', label: 'Color mid-life', group: 'Color' },
    color3: { value: '#5a2bff', label: 'Color at the end', group: 'Color' },
    colorBy: { value: 'life', options: ['life', 'speed', 'source', 'height', 'random'], label: 'Color by', group: 'Color', hint: 'source: the picture / model / text colors they were born on' },
    hue: { value: 0, min: -0.5, max: 0.5, label: 'Hue shift', group: 'Color' },
    sat: { value: 1, min: 0, max: 2, label: 'Saturation', group: 'Color' },
    speed: { value: 0.6, min: 0, max: 8, label: 'Launch speed', group: 'Motion' },
    spread: { value: 1, min: 0, max: 1, label: 'Spread', group: 'Motion', hint: '0: all along the direction · 1: every way' },
    dirY: { value: 1, min: -1, max: 1, label: 'Direction (down / up)', group: 'Motion' },
    dirZ: { value: 0, min: -1, max: 1, label: 'Direction (away / toward)', group: 'Motion' },
    outward: { value: 0, min: -2, max: 4, label: 'Outward', group: 'Motion', hint: 'Launched away from the emitter\'s middle' },
    swirl: { value: 0, min: -3, max: 3, label: 'Swirl', group: 'Motion', hint: 'Launched around the middle (orbits)' },
    maxSpeed: { value: 12, min: 0.2, max: 30, label: 'Speed limit', group: 'Motion' },
    emitSize: { value: 1, min: 0.05, max: 8, label: 'Emitter size', group: 'Emitter' },
    emitX: { value: 0, min: -6, max: 6, label: 'Emitter left / right', group: 'Emitter' },
    emitY: { value: 0, min: -6, max: 6, label: 'Emitter down / up', group: 'Emitter' },
    emitZ: { value: 0, min: -6, max: 6, label: 'Emitter far / near', group: 'Emitter' },
    emitSpin: { value: 0, min: -2, max: 2, label: 'Emitter turn', group: 'Emitter' },
    jitter: { value: 0.02, min: 0, max: 0.6, label: 'Birth jitter', group: 'Emitter' },
    threshold: { value: 0.35, min: 0.02, max: 0.95, label: 'Bright pixels over', group: 'Emitter', hint: 'Picture / layer emitters: how bright a pixel must be to give particles' },
    curl: { value: 0.6, min: 0, max: 3, label: 'Flow (curl noise)', group: 'Forces' },
    curlScale: { value: 0.6, min: 0.05, max: 4, label: 'Flow scale', group: 'Forces' },
    curlSpeed: { value: 0.15, min: 0, max: 2, label: 'Flow change', group: 'Forces' },
    turb: { value: 0, min: 0, max: 2, label: 'Turbulence', group: 'Forces' },
    gravity: { value: 0, min: -3, max: 8, label: 'Gravity', group: 'Forces', hint: 'Negative: they rise' },
    wind: { value: 0, min: -3, max: 3, label: 'Wind', group: 'Forces' },
    drag: { value: 0.5, min: 0, max: 5, label: 'Drag', group: 'Forces' },
    vortex: { value: 0, min: -4, max: 4, label: 'Vortex', group: 'Forces' },
    vortexPull: { value: 0, min: -1, max: 3, label: 'Pull to the middle', group: 'Forces' },
    attract: { value: 0, min: -3, max: 3, label: 'Attractors', group: 'Forces', hint: 'Two points circling the middle pull them (negative: push)' },
    boids: { value: 0, min: 0, max: 2, label: 'Flocking', group: 'Forces', hint: 'Boids-lite: each follows its neighbours' },
    form: { value: 0, min: 0, max: 1, label: 'Hold the shape', group: 'Forces', hint: 'Pulled back to where they were born (text, a model, a picture)' },
    dissolve: { value: 0, min: 0, max: 1, label: 'Dissolve', group: 'Forces', hint: 'Lets go of the shape (keyframe it 0 → 1)' },
    sweep: { value: 0, min: 0, max: 1, label: 'Dissolve sweep', group: 'Forces', hint: '1: it lets go from left to right' },
    floor: { value: -99, min: -6, max: 2, label: 'Floor', group: 'Forces', hint: 'They bounce on it (−6: none in view)' },
    bounce: { value: 0.35, min: 0, max: 1, label: 'Bounce', group: 'Forces' },
    kickEmit: { value: 0, min: 0, max: 1, label: 'Burst on kick', group: 'Music', hint: 'A share of the waiting particles is born on each kick' },
    kickPush: { value: 0, min: 0, max: 6, label: 'Explode on kick', group: 'Music', hint: 'A push outward on each kick' },
    bassForce: { value: 0, min: 0, max: 3, label: 'Forces follow the bass', group: 'Music' },
    hueBright: { value: 0, min: -1, max: 1, label: 'Color follows brightness', group: 'Music', hint: 'The hue moves with the sound\'s brightness (spectral centroid)' },
    orbit: { value: 0, min: -1, max: 1, label: 'Camera orbit', group: 'Camera' },
    distance: { value: 6, min: 1, max: 30, label: 'Camera distance', group: 'Camera' },
    tilt: { value: 0.12, min: -1.4, max: 1.4, label: 'Camera tilt', group: 'Camera' },
  };
  // every preset shows these (+ its own keys)
  const BASE = ['count', 'emit', 'life', 'size', 'sizeEnd', 'opacity', 'color1', 'color2', 'color3', 'sprite', 'blend', 'trail', 'speed', 'curl', 'kickEmit', 'kickPush', 'bassForce', 'hueBright', 'orbit', 'distance'];
  const EMITTERS = ['point', 'sphere', 'ball', 'disc', 'ring', 'box', 'plane', 'line', 'torus', 'spiral', 'text', 'image', 'model', 'layer'];
  const EMITTER_HINT = { point: 'one point', sphere: 'a sphere\'s surface', ball: 'inside a ball', disc: 'a flat disc', ring: 'a ring', box: 'inside a box', plane: 'a flat sheet (sky: snow, rain)', line: 'a line', torus: 'a donut', spiral: 'galaxy arms', text: 'the letters of a word', image: 'a reference picture\'s bright pixels', model: 'a 🧊 model layer\'s surface', layer: 'another layer\'s bright pixels' };
  const P = (id, name, cat, desc, sliders, opts, react = []) => ({ id, name, cat, desc, sliders, opts, react });
  const PRESETS = [
    // ---- space ----
    P('galaxy', 'Galaxy', 'Space', 'Spiral arms of stars turning around a bright core', { count: 300, life: 60, emit: 1, size: 0.018, sizeEnd: 1, opacity: 0.9, speed: 0, swirl: 0.5, vortexPull: 0.25, drag: 0.02, curl: 0.03, emitSize: 3, tilt: 0.55, orbit: 0.04, distance: 6.5, colorBy: 'source', color1: '#ffe6c4', color2: '#9fb4ff', color3: '#6b3cff', bounds: 12, bassForce: 0.2 }, { emitter: 'spiral', arms: 3, twist: 5 }, [['size', 'kickOn', 0.2], ['opacity', 'loudness', 0.2]]),
    P('nebula', 'Nebula', 'Space', 'Slow clouds of colored gas drifting in a flow', { count: 80, life: 60, size: 0.28, sizeEnd: 1, sizeVar: 0.8, opacity: 0.07, speed: 0, curl: 0.3, curlScale: 0.4, curlSpeed: 0.05, drag: 1, emitSize: 2.6, colorBy: 'height', color1: '#ff5ea8', color2: '#7a3cff', color3: '#24d4c8', orbit: 0.03 }, { emitter: 'ball' }, [['opacity', 'loudness', 0.3]]),
    P('starfield', 'Warp stars', 'Space', 'Stars streaking past toward the camera', { count: 60, life: 3, emit: 1, look: 'streak', streak: 0.25, size: 0.012, sizeEnd: 1, speed: 6, spread: 0.02, dirY: 0, dirZ: 1, curl: 0, drag: 0, emitSize: 6, emitZ: -8, color1: '#ffffff', color2: '#bcd4ff', color3: '#7aa2ff', fadeIn: 0.3, fadeOut: 0.1 }, { emitter: 'box' }, [['speed', 'loudness', 0.3]]),
    P('blackhole', 'Black hole', 'Space', 'A disc of matter spiralling into the middle', { count: 200, life: 60, size: 0.015, sizeEnd: 1, speed: 0, swirl: 0.6, vortex: 0.5, vortexPull: 0.7, drag: 0.25, curl: 0.05, emitSize: 4, tilt: 0.35, colorBy: 'speed', color1: '#ff3d00', color2: '#ffb347', color3: '#ffffff', bounds: 8, sink: 0.12 }, { emitter: 'disc' }),
    P('comet', 'Comet', 'Space', 'A glowing head circling with a long tail', { count: 40, life: 1.6, size: 0.05, sizeEnd: 0.1, speed: 0.15, curl: 0.2, trail: 0.8, emitX: 1.8, emitSpin: 1, emitSize: 0.05, color1: '#ffffff', color2: '#7fe7ff', color3: '#2b4cff' }, { emitter: 'point' }),
    // ---- nature ----
    P('smoke', 'Smoke', 'Nature', 'Soft gray smoke rising and curling', { count: 60, life: 5, size: 0.14, sizeEnd: 3, opacity: 0.16, fadeIn: 0.15, fadeOut: 0.7, speed: 0.5, spread: 0.3, gravity: -0.3, curl: 0.8, curlScale: 0.5, drag: 0.6, emitSize: 0.4, emitY: -1.6, blend: 'alpha', color1: '#d8d8dc', color2: '#9a9aa4', color3: '#4a4a52' }, { emitter: 'disc' }),
    P('fire', 'Fire', 'Nature', 'Flames licking upward from a bed of embers', { count: 80, life: 1.4, size: 0.12, sizeEnd: 0.15, opacity: 0.6, speed: 0.8, spread: 0.25, gravity: -1.2, curl: 0.6, curlScale: 1.2, drag: 0.6, emitSize: 0.6, emitY: -1.5, color1: '#fff3b0', color2: '#ff7a1a', color3: '#5a0b00' }, { emitter: 'disc' }, [['speed', 'bass', 0.4]]),
    P('embers', 'Embers', 'Nature', 'Sparks of a fire floating up and fading', { count: 20, life: 6, size: 0.022, sizeEnd: 0.2, speed: 0.3, spread: 0.4, gravity: -0.3, curl: 0.4, turb: 0.15, emitSize: 3, emitY: -2, sprite: 'star', color1: '#ffe08a', color2: '#ff6a1a', color3: '#7a1a00' }, { emitter: 'disc' }),
    P('fireflies', 'Fireflies', 'Nature', 'Little lights wandering in the dark, blinking in and out', { count: 3, life: 8, size: 0.035, sizeEnd: 1, sizeVar: 0.6, fadeIn: 0.3, fadeOut: 0.4, speed: 0.05, curl: 0.25, curlScale: 0.3, turb: 0.1, emitSize: 3, color1: '#f6ff8a', color2: '#b8ff5a', color3: '#3dff9a' }, { emitter: 'box' }, [['opacity', 'hatOn', 0.3]]),
    P('snow', 'Snow', 'Nature', 'Flakes falling softly, swaying in the air', { count: 40, life: 12, size: 0.03, sizeEnd: 1, sizeVar: 0.7, opacity: 0.9, fadeIn: 0.05, fadeOut: 0.1, speed: 0.05, dirY: -1, gravity: 0.25, drag: 1.4, curl: 0.15, curlScale: 0.4, turb: 0.04, wind: 0.08, emitSize: 6, emitY: 4, blend: 'alpha', color1: '#ffffff', color2: '#f0f6ff', color3: '#dbe8ff' }, { emitter: 'plane' }),
    P('rain', 'Rain', 'Nature', 'Streaks of rain driving down at an angle', { count: 50, life: 1.6, look: 'streak', streak: 0.06, size: 0.008, sizeEnd: 1, opacity: 0.5, fadeIn: 0.02, fadeOut: 0.05, speed: 6, spread: 0.02, dirY: -1, gravity: 4, drag: 0, curl: 0, wind: 0.6, emitSize: 6, emitY: 4.5, blend: 'alpha', color1: '#cfe3ff', color2: '#a8c8ff', color3: '#88aaff' }, { emitter: 'plane' }),
    P('bubbles', 'Bubbles', 'Nature', 'Rings rising and wobbling like bubbles in water', { count: 5, life: 7, size: 0.09, sizeEnd: 1.3, sizeVar: 0.7, sprite: 'ring', opacity: 0.6, speed: 0.2, spread: 0.3, gravity: -0.5, drag: 0.8, turb: 0.2, curl: 0.2, emitSize: 4, emitY: -3, blend: 'alpha', color1: '#bff6ff', color2: '#7fdcff', color3: '#3aa0ff' }, { emitter: 'plane' }),
    P('dust', 'Dust motes', 'Nature', 'Tiny specks floating in a beam of light', { count: 15, life: 14, size: 0.01, sizeEnd: 1, opacity: 0.45, fadeIn: 0.3, fadeOut: 0.3, speed: 0.02, curl: 0.12, curlScale: 0.25, drag: 1.5, emitSize: 3, color1: '#fff1d6', color2: '#ffe2a8', color3: '#ffd27a' }, { emitter: 'box' }),
    P('aurora', 'Aurora', 'Nature', 'Curtains of light flowing across the sky (with trails)', { count: 60, life: 5, size: 0.02, sizeEnd: 0.6, opacity: 0.5, trail: 0.88, speed: 0.1, gravity: -0.05, curl: 1.4, curlScale: 0.25, curlSpeed: 0.08, emitSize: 4, emitY: 1, color1: '#4dffb0', color2: '#2bd4ff', color3: '#a24dff' }, { emitter: 'line' }),
    // ---- motion ----
    P('ribbons', 'Flow ribbons', 'Motion', 'Long glowing ribbons following a flow field', { count: 30, life: 6, size: 0.016, sizeEnd: 1, opacity: 0.7, trail: 0.93, speed: 0.2, curl: 1.2, curlScale: 0.35, drag: 0.4, emitSize: 2, color1: '#ff4fd8', color2: '#7a5cff', color3: '#2be0ff' }, { emitter: 'box' }, [['curl', 'loudness', 0.3]]),
    P('tornado', 'Tornado', 'Motion', 'A funnel of dust spinning upward', { count: 120, life: 6, size: 0.02, sizeEnd: 1.5, opacity: 0.5, speed: 0.3, vortex: 2, vortexPull: 0.6, gravity: -0.8, curl: 0.2, emitSize: 2, emitY: -2.2, color1: '#e8d8c0', color2: '#b09070', color3: '#604830' }, { emitter: 'disc' }),
    P('swarm', 'Swarm', 'Motion', 'Little shards flocking together around two moving points', { count: 20, life: 60, look: 'mesh', size: 0.05, sizeEnd: 1, speed: 0.6, boids: 1, curl: 0.4, attract: 0.4, drag: 0.4, emitSize: 2, blend: 'alpha', colorBy: 'random', color1: '#ffcf4d', color2: '#ff6a3d', color3: '#2b2b33' }, { emitter: 'ball', mesh: 'shard' }),
    P('attractors', 'Orbit attractors', 'Motion', 'Glowing threads orbiting two pulling points', { count: 60, life: 60, size: 0.012, sizeEnd: 1, opacity: 0.8, trail: 0.85, speed: 0.4, attract: 1.2, curl: 0.15, drag: 0.1, emitSize: 2, colorBy: 'speed', color1: '#2b6bff', color2: '#ff3dbb', color3: '#fff2a8' }, { emitter: 'ball' }, [['attract', 'bass', 0.3]]),
    P('fountain', 'Fountain', 'Motion', 'A jet of drops arcing up and splashing on the floor', { count: 50, life: 2.5, size: 0.02, sizeEnd: 0.6, speed: 4, spread: 0.12, dirY: 1, gravity: 3, drag: 0.1, curl: 0, floor: -1.8, bounce: 0.3, emitSize: 0.05, emitY: -1.6, color1: '#e8fbff', color2: '#7fd8ff', color3: '#2b7bff' }, { emitter: 'point' }),
    // ---- music ----
    P('sparks', 'Sparks on kick', 'Music', 'A shower of sparks bursting on every kick', { count: 60, emit: 0, life: 1.2, look: 'streak', streak: 0.08, size: 0.015, sizeEnd: 0.3, speed: 4, spread: 1, gravity: 3, drag: 0.4, curl: 0, floor: -1.8, bounce: 0.4, kickEmit: 0.35, emitSize: 0.05, emitY: -0.4, color1: '#ffffff', color2: '#ffb347', color3: '#ff3d00' }, { emitter: 'point' }),
    P('kicksphere', 'Kick sphere', 'Music', 'A sphere of light that blows apart on the kick and pulls itself back', { count: 120, life: 60, size: 0.02, sizeEnd: 1, speed: 0, form: 1, kickPush: 2.5, bassForce: 0.6, curl: 0.4, emitSize: 1.4, colorBy: 'speed', color1: '#5ae0ff', color2: '#b44dff', color3: '#ff4d8d' }, { emitter: 'sphere' }),
    P('shockwave', 'Shockwave rings', 'Music', 'A ring of light rushing out on every kick', { count: 60, emit: 0, life: 1.4, size: 0.02, sizeEnd: 0.3, speed: 0, spread: 0, outward: 3, drag: 1.2, curl: 0.1, kickEmit: 0.8, emitSize: 0.2, tilt: 0.9, color1: '#ffffff', color2: '#4dd2ff', color3: '#2b2bff' }, { emitter: 'ring' }),
    P('confetti', 'Confetti', 'Music', 'Colored paper bursting out on kicks and fluttering down', { count: 20, emit: 0.05, life: 4, look: 'mesh', size: 0.05, sizeEnd: 1, speed: 3, spread: 1, dirY: 1, gravity: 1.5, drag: 1.5, curl: 0.3, turb: 0.3, kickEmit: 0.25, emitSize: 0.1, emitY: 0.5, blend: 'alpha', colorBy: 'random', color1: '#ff3d6e', color2: '#ffd23d', color3: '#3dd2ff' }, { emitter: 'point', mesh: 'box' }),
    P('spectrum', 'Spectrum fountain', 'Music', 'A fountain whose height follows the bass and color the sound\'s brightness', { count: 60, life: 2.2, size: 0.025, sizeEnd: 0.4, speed: 3.2, spread: 0.18, gravity: 2.5, drag: 0.2, curl: 0.2, bassForce: 1.2, hueBright: 0.6, kickEmit: 0.2, emitSize: 0.6, emitY: -1.8, color1: '#ffffff', color2: '#ff4dd2', color3: '#3d5aff' }, { emitter: 'line' }, [['speed', 'bass', 0.4]]),
    // ---- shapes ----
    P('dissolve', 'Text that dissolves', 'Shapes', 'A word made of particles that blows away like dust, left to right (keyframe Dissolve)', { count: 120, life: 60, size: 0.012, sizeEnd: 1, speed: 0, form: 1, dissolve: 0.35, sweep: 0.75, curl: 0.7, gravity: -0.25, drag: 0.6, bounds: 7, colorBy: 'height', color1: '#ffffff', color2: '#ffd27a', color3: '#ff6a3d', homeJitter: 0.004 }, { emitter: 'text', text: 'HEARTH' }),
    P('modeldust', 'Model into dust', 'Shapes', 'The 🧊 model below turns to dust and blows away (keyframe Dissolve; it bursts on kicks)', { count: 200, life: 60, size: 0.01, sizeEnd: 1, speed: 0, form: 1, dissolve: 0.3, sweep: 0.3, curl: 0.6, gravity: -0.2, drag: 0.6, kickPush: 1.2, bounds: 9, colorBy: 'height', color1: '#ffe8c4', color2: '#d9a066', color3: '#6b4a2b', homeJitter: 0.003 }, { emitter: 'model', source: 'auto', camera: 'source' }),
    P('glowrise', 'Light rising off a layer', 'Shapes', 'The bright parts of the layer below give off rising light', { count: 40, life: 1.6, size: 0.02, sizeEnd: 0.3, speed: 0.3, spread: 0.5, gravity: -0.5, curl: 0.4, drag: 0.5, colorBy: 'source', orbit: 0, tilt: 0, jitter: 0.01 }, { emitter: 'layer', source: 'auto' }),
    P('logo', 'Particle word', 'Shapes', 'A word made of shimmering particles that bursts on kicks and comes back', { count: 100, life: 60, size: 0.014, sizeEnd: 1, speed: 0, form: 1, curl: 0.25, kickPush: 1.5, colorBy: 'random', color1: '#ffffff', color2: '#ffd27a', color3: '#ff8a3d', homeJitter: 0.004 }, { emitter: 'text', text: 'HEARTH' }),
    P('torus', 'Torus flow', 'Shapes', 'A donut of particles streaming around itself', { count: 150, life: 60, size: 0.012, sizeEnd: 1, speed: 0, form: 0.35, swirl: 0.4, curl: 0.35, emitSize: 1.6, tilt: 0.6, orbit: 0.05, colorBy: 'speed', color1: '#3dd2ff', color2: '#ffffff', color3: '#ff3dbb' }, { emitter: 'torus' }),
    P('picture', 'Picture in particles', 'Shapes', 'A reference picture rebuilt from particles that shimmer and drift (/particles picture <reference>)', { count: 200, life: 60, size: 0.012, sizeEnd: 1, speed: 0, form: 1, curl: 0.2, colorBy: 'source', threshold: 0.15, homeJitter: 0.004 }, { emitter: 'image', image: '' }),
  ];
  // help for /particles help and three_do particles help (on demand only)
  const HELP = `✦ GPU particles: a layer whose code calls particles(P, opts). Simulated on the GPU (float textures, 60 steps a second of the scene's clock: pause holds them, scrubbing and renders land on the same frame).
Presets: /particles list (${PRESETS.length}) · /particles <preset> adds one · /particles text <word> · /particles model [layer] · /particles picture <reference> · /particles from <layer>.
Sliders (live; ♪ react-to, keyframes, Shuffle work): count (thousands) emit life size sizeEnd opacity color1-3 colorBy trail streak speed spread outward swirl curl curlScale turb gravity wind drag vortex vortexPull attract boids form dissolve sweep floor bounce · Music: kickEmit (burst on kick) kickPush (explode on kick) bassForce (forces × bass) hueBright (hue follows the brightness / spectral centroid).
Options (opts, in the code): emitter ${EMITTERS.join(' | ')} · text · font · image (reference key) · source (a layer's name, or auto) · look points | streak | mesh · mesh tetra | octa | box | shard · camera own | source (follow the model layer's camera) · attractors [[x, y, z, strength]] · seed.
Commands: /particles set <slider> <value> · /particles emitter <kind> · /particles look <points|streak|mesh> · /particles react (the preset's music links) · /particles info.`;
  return { SLIDERS, BASE, EMITTERS, EMITTER_HINT, PRESETS, HELP };
})();
window.ParticleData = ParticleData;
