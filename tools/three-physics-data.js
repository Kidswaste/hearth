// ⚛ Light physics (round 25, physics): the sliders a physics layer can have and the presets (one searchable list:
// /physics, the FX picker's "Physics" category, three_do physics list). A preset is the sliders it shows (with its
// values) + the options that pick its scene (build) and extras; tools/three-physics.js turns one into layer code that
// calls physics(P, opts) (the runtime: tools/three-sandbox.html "light physics").
// Music sliders are 0 in the presets that aren't about music, so a new layer moves by itself on the timeline and
// follows the song only when the owner wants it to (or picks a "Music" preset).
const PhysicsData = (() => {
  // key → tweak spec. Groups match the Lab's slider groups.
  const SLIDERS = {
    count: { value: 12, min: 1, max: 400, step: 1, label: 'Bodies', group: 'Physics', hint: 'How many (balls, boxes, dominoes, pendulums, ragdolls…): rebuilds the scene' },
    size: { value: 1, min: 0.3, max: 3, label: 'Size', group: 'Physics', hint: 'The scene\'s scale: rebuilds it' },
    gravity: { value: 1, min: -1, max: 3, label: 'Gravity', group: 'Physics', hint: '1 = Earth · 0 = floating · negative: things rise' },
    timeScale: { value: 1, min: 0, max: 2, label: 'Speed', group: 'Physics', hint: 'Below 1: slow motion · 0: frozen in the air' },
    bounce: { value: 0.3, min: 0, max: 1, label: 'Bounce', group: 'Physics', hint: 'How much balls, blobs and ragdolls bounce' },
    friction: { value: 0.5, min: 0, max: 1.5, label: 'Friction', group: 'Physics' },
    damping: { value: 0.05, min: 0, max: 3, label: 'Air drag', group: 'Physics' },
    stiffness: { value: 0.5, min: 0, max: 1, label: 'Stiffness', group: 'Physics', hint: 'Cloth folds and jelly wobble (low: floppy)' },
    quality: { value: 8, min: 2, max: 24, step: 1, label: 'Substeps', group: 'Physics', hint: 'More: stiffer, more exact contacts (and slower)' },
    wind: { value: 0, min: -15, max: 15, label: 'Wind', group: 'Wind', hint: 'Blows cloth, ropes and balloons along x' },
    turb: { value: 0, min: 0, max: 2, label: 'Gusts', group: 'Wind' },
    kick: { value: 0, min: 0, max: 10, label: 'Kick impulse', group: 'Music', hint: 'A push on every kick (your kick markers, the song\'s beats, live input; a 120 BPM grid with nothing loaded)' },
    kickMode: { value: 'jump', options: ['jump', 'push', 'blast', 'spin', 'gust'], label: 'Kick does', group: 'Music', hint: 'jump: up · push: sideways · blast: out from the middle · spin · gust: a gust of wind' },
    bassGravity: { value: 0, min: 0, max: 1, label: 'Bass lightens gravity', group: 'Music' },
    bassWind: { value: 0, min: 0, max: 15, label: 'Bass blows wind', group: 'Music' },
    drop: { value: 0, min: 0, max: 20, label: 'Explode on the drop', group: 'Music', hint: 'A blast at the song\'s drops (or the scene\'s dropAt seconds); pinned curtains fall' },
    color1: { value: '#ff7a45', label: 'Color 1', group: 'Colors' },
    color2: { value: '#ffd166', label: 'Color 2', group: 'Colors' },
    color3: { value: '#4cc9f0', label: 'Color 3', group: 'Colors' },
    metal: { value: 0.1, min: 0, max: 1, label: 'Metal', group: 'Material' },
    rough: { value: 0.45, min: 0.02, max: 1, label: 'Roughness', group: 'Material' },
    floor: { value: 'shadow', options: ['shadow', 'solid', 'none'], label: 'Floor', group: 'Material', hint: 'shadow: only the shadows (layers below show through)' },
    floorColor: { value: '#20232b', label: 'Floor color', group: 'Material' },
    camDist: { value: 8, min: 2, max: 30, label: 'Camera distance', group: 'Camera' },
    camHeight: { value: 2.5, min: -1, max: 12, label: 'Camera height', group: 'Camera' },
    camAngle: { value: 0, min: -180, max: 180, label: 'Camera angle', group: 'Camera' },
    orbit: { value: 0, min: -1, max: 1, label: 'Orbit', group: 'Camera', hint: 'The camera circles the scene' },
    lookY: { value: 0.9, min: -1, max: 5, label: 'Look at height', group: 'Camera' },
  };
  // always in a physics layer's tweak (on top of each preset's own)
  const BASE = ['count', 'size', 'gravity', 'timeScale', 'bounce', 'friction', 'kick', 'kickMode', 'drop', 'color1', 'color2', 'color3', 'floor', 'camDist', 'camHeight', 'camAngle', 'orbit'];
  // the scenes the runtime builds (opts.build)
  const BUILDS = ['letters', 'jumpletters', 'balls', 'rain', 'cuberain', 'pendulums', 'cradle', 'dominoes', 'ragdolls', 'tower', 'pyramid', 'wrecking', 'chains', 'flag', 'curtain', 'drape', 'trampoline', 'beads', 'blobs', 'jellystack', 'balloons', 'plinko', 'dambreak', 'slosh', 'zerog', 'models', 'empty'];
  // bodies /physics add and three_do physics body put in (opts.bodies)
  const BODIES = { box: 'a box (size [w, h, d])', ball: 'a ball (r)', blob: 'a jelly blob (r, soft)', cloth: 'a cloth (size [w, h], pin top | left | corners | edges)', rope: 'a rope (length, ball: true for a weight)', ragdoll: 'a ragdoll', water: 'a block of water (size [w, h, d])' };
  const P = (id, name, cat, desc, sliders, opts, react) => ({ id, name, cat, desc, sliders, opts, react: react || null });
  const PRESETS = [
    // ---- music ----
    P('bounce', 'Bouncing balls on beat', 'Music', 'Balls in a box that jump on every kick', { count: 24, bounce: 0.8, kick: 3.5, kickMode: 'jump', color1: '#ff4d6d', color2: '#ffd166', color3: '#06d6a0', camHeight: 3 }, { build: 'balls' }),
    P('jumpletters', 'Letters jumping on the beat', 'Music', 'A word of blocks that hops on the kicks', { bounce: 0.3, kick: 3.2, kickMode: 'jump', color1: '#f72585', color2: '#7209b7', color3: '#4cc9f0', camHeight: 1.6, lookY: 0.6, camDist: 7 }, { build: 'jumpletters', text: 'HEARTH' }),
    P('tower', 'Tower that topples on the drop', 'Music', 'A crossed plank tower blown apart at the drop (dropAt 6 s without a song)', { count: 10, friction: 0.7, drop: 9, color1: '#e9c46a', color2: '#f4a261', color3: '#e76f51', camHeight: 3.2, lookY: 1.3, camDist: 10.5 }, { build: 'tower', dropAt: 6 }),
    P('pyramid', 'Box pyramid that blows up on the drop', 'Music', 'Stacked boxes, a blast at the drop (5 s without a song)', { count: 7, friction: 0.6, drop: 8, color1: '#8338ec', color2: '#3a86ff', color3: '#ff006e', camHeight: 2.6, lookY: 1.2 }, { build: 'pyramid', dropAt: 5 }),
    P('zerog', 'Zero gravity (blasts on kicks)', 'Music', 'Boxes and balls floating in a room, pushed out on each kick', { count: 40, gravity: 0, bounce: 0.6, kick: 3, kickMode: 'blast', damping: 0.05, color1: '#00f5d4', color2: '#9b5de5', color3: '#f15bb5', camHeight: 1.8, lookY: 1.8, camDist: 9, orbit: 0.15 }, { build: 'zerog' }),
    P('slosh', 'Water tank sloshing on kicks', 'Music', 'A tank of water pushed sideways on each kick', { kick: 1.5, kickMode: 'push', damping: 0, color1: '#2ec4f1', quality: 4, camHeight: 2.6, camDist: 6, lookY: 0.3 }, { build: 'slosh' }),
    P('trampoline', 'Trampoline', 'Music', 'Balls bouncing on a stretched cloth, launched on kicks', { count: 10, bounce: 0.6, kick: 3, kickMode: 'jump', stiffness: 0.7, color1: '#ff9f1c', color2: '#2ec4b6', color3: '#cbf3f0', camHeight: 3.2, lookY: 0.8 }, { build: 'trampoline' }),
    // ---- type ----
    P('letters', 'Falling letters', 'Type', 'A word of blocks dropping one after another and piling up', { bounce: 0.25, kick: 0, color1: '#ffbe0b', color2: '#fb5607', color3: '#3a86ff', camHeight: 2, lookY: 0.7, camDist: 8 }, { build: 'letters', text: 'HEARTH' }),
    // ---- rigid ----
    P('dominoes', 'Domino run', 'Rigid', 'A curving line of dominoes, the first one tipped', { count: 48, friction: 0.6, color1: '#f8f9fa', color2: '#e63946', color3: '#1d3557', camHeight: 5, camDist: 11, camAngle: 25, lookY: 0 }, { build: 'dominoes' }),
    P('cradle', "Newton's cradle", 'Rigid', 'Five steel balls on strings knocking each other (kick: the first one again)', { count: 5, bounce: 0.97, friction: 0, damping: 0, quality: 16, kick: 0, kickMode: 'push', metal: 0.9, rough: 0.15, color1: '#d9d9d9', color2: '#bfc5cc', color3: '#7b8794', camHeight: 2, lookY: 1.4, camDist: 6 }, { build: 'cradle', kickOnly: 'first' }),
    P('wrecking', 'Wrecking ball', 'Rigid', 'A heavy ball swinging into a wall of boxes (kick: swing it again)', { count: 6, kick: 0, kickMode: 'push', friction: 0.6, color1: '#e76f51', color2: '#f4a261', color3: '#264653', camHeight: 3, lookY: 1.4, camDist: 10, camAngle: 20 }, { build: 'wrecking', kickOnly: 'first' }),
    P('cuberain', 'Cube rain', 'Rigid', 'Cubes falling in one after another and piling up', { count: 70, friction: 0.6, bounce: 0.1, color1: '#ff595e', color2: '#ffca3a', color3: '#1982c4', camHeight: 3.5, lookY: 0.8 }, { build: 'cuberain' }),
    P('models', 'Model rain (your 🧊 model)', 'Rigid', 'Copies of the 🧊 model layer\'s model tumbling in (its box is the hull)', { count: 8, friction: 0.6, bounce: 0.1, camHeight: 2.6, lookY: 0.8 }, { build: 'models', source: 'auto' }),
    // ---- soft & cloth ----
    P('blobs', 'Jelly blobs', 'Soft & cloth', 'Wobbly blobs dropping into a pile', { count: 10, stiffness: 0.35, bounce: 0.4, kick: 0, kickMode: 'jump', color1: '#ff70a6', color2: '#70d6ff', color3: '#ffd670', rough: 0.2, camHeight: 3, lookY: 0.6 }, { build: 'blobs' }),
    P('jellystack', 'Jelly pyramid', 'Soft & cloth', 'A pyramid of jelly that wobbles (made to react to the music, it hops on kicks)', { count: 12, stiffness: 0.55, kick: 0, kickMode: 'jump', color1: '#06d6a0', color2: '#118ab2', color3: '#ef476f', rough: 0.15, camHeight: 2, lookY: 0.7 }, { build: 'jellystack' }),
    P('balloons', 'Balloons on strings', 'Soft & cloth', 'Balloons tied to the floor, swaying in gusts', { count: 7, wind: 1, turb: 0.8, kick: 0, kickMode: 'gust', stiffness: 0.7, color1: '#ef233c', color2: '#ffd60a', color3: '#4361ee', rough: 0.2, camHeight: 2.6, lookY: 2.2, camDist: 9 }, { build: 'balloons' }),
    P('flag', 'Flag in the wind', 'Soft & cloth', 'A flag flapping on its pole (made to react to the music, the bass blows harder)', { wind: 7, turb: 0.8, stiffness: 0.6, kick: 0, kickMode: 'gust', color1: '#e63946', color2: '#f1faee', color3: '#a8dadc', camHeight: 2.6, lookY: 2.6, camDist: 7, camAngle: 25 }, { build: 'flag' }),
    P('curtain', 'Curtain (falls on the drop)', 'Soft & cloth', 'A curtain billowing in gusts that drops off its rail at the drop (8 s without a song)', { wind: 1.5, turb: 1.2, stiffness: 0.5, kickMode: 'gust', color1: '#9d0208', color2: '#dc2f02', color3: '#370617', camHeight: 2, lookY: 1.6, camDist: 7 }, { build: 'curtain', dropAt: 8, release: true }),
    P('drape', 'Cloth over a ball', 'Soft & cloth', 'A sheet falling over a sphere and settling in folds', { stiffness: 0.35, friction: 0.8, color1: '#ffe8d6', color2: '#cb997e', color3: '#6b705c', camHeight: 2.6, lookY: 0.6, camDist: 6 }, { build: 'drape' }),
    // ---- ropes ----
    P('pendulums', 'Pendulum wave', 'Ropes', 'Pendulums of growing length falling in and out of step', { count: 15, damping: 0, bounce: 0, friction: 0, kickMode: 'push', color1: '#ffd166', color2: '#ef476f', color3: '#adb5bd', metal: 0.6, rough: 0.25, camHeight: 2.4, camDist: 8, camAngle: 65, lookY: 2 }, { build: 'pendulums' }),
    P('chains', 'Hanging chains', 'Ropes', 'Ropes with weights from a rail (kick: they swing)', { count: 8, kick: 0, kickMode: 'push', color1: '#ffb703', color2: '#fb8500', color3: '#8ecae6', camHeight: 2.4, lookY: 2, camDist: 8 }, { build: 'chains' }),
    P('beads', 'Bead curtain', 'Ropes', 'Strings of beads swaying in the wind', { count: 22, wind: 1.5, turb: 1, kick: 0, kickMode: 'gust', color1: '#f72585', color2: '#b5179e', color3: '#4cc9f0', camHeight: 2.2, lookY: 2.1, camDist: 7 }, { build: 'beads' }),
    // ---- fun ----
    P('rain', 'Ball rain', 'Fun', 'Balls pouring into a box until it fills', { count: 160, bounce: 0.5, color1: '#ffadad', color2: '#a0c4ff', color3: '#caffbf', camHeight: 3.5, lookY: 0.8 }, { build: 'rain' }),
    P('plinko', 'Plinko (Galton board)', 'Fun', 'Balls bouncing down through pegs into bins', { count: 80, bounce: 0.45, friction: 0.2, color1: '#fee440', color2: '#f15bb5', color3: '#e0e0e0', camHeight: 2.4, lookY: 2.1, camDist: 7.5, floor: 'solid' }, { build: 'plinko' }),
    P('ragdolls', 'Ragdolls down the stairs', 'Fun', 'Floppy figures tumbling down a flight of steps', { count: 4, bounce: 0.15, friction: 0.7, color1: '#ffd6a5', color2: '#9bf6ff', color3: '#6c757d', camHeight: 2.6, lookY: 0.8, camDist: 8, camAngle: 30 }, { build: 'ragdolls' }),
    P('dambreak', 'Dam break (water)', 'Water', 'A block of water let go in a tank, splashing and settling', { count: 12, damping: 0, quality: 4, color1: '#219ebc', camHeight: 2.6, lookY: 0.3, camDist: 6 }, { build: 'dambreak' }),
    P('sandbox', 'Empty (your own bodies)', 'Fun', 'A floor and two bodies: add yours with /physics add <box|ball|blob|cloth|rope|ragdoll|water>', { count: 1, camHeight: 2.2 }, { build: 'empty', bodies: [{ type: 'box', at: [0, 1.5, 0], size: [0.6, 0.6, 0.6] }, { type: 'ball', at: [0.2, 3, 0], r: 0.25, color: 1 }] }),
  ];
  // help for /physics help and three_do physics help (on demand only)
  const HELP = `⚛ Light physics: a layer whose code calls physics(P, opts). A small position-based solver (rigid boxes / letters / dominoes / model hulls, balls, ragdolls, cloth, ropes, jelly blobs, water) stepped 60 times a second on the scene's clock: renders land on the same frame every time; scrubbing back restores the nearest cached state and re-simulates; bodies at rest sleep; boxes, balls, rope pieces and water drops are drawn instanced.
Presets: /physics list (${PRESETS.length}) · /physics <preset> adds one · /physics text <word> (falling letters) · /physics model [layer] (copies of a 🧊 model).
Sliders (live; ♪ react-to, keyframes, Shuffle work): gravity timeScale (slow motion) bounce friction damping stiffness quality wind turb · count size (rebuild) · Music: kick (impulse on kicks) kickMode jump|push|blast|spin|gust · bassGravity bassWind · drop (blast at the song's drops / opts.dropAt) · Look: color1-3 metal rough floor shadow|solid|none floorColor · camDist camHeight camAngle orbit lookY.
Options (opts, JSON in the code): build ${BUILDS.join(' | ')} · text · font · source (a 🧊 model layer) · dropAt (seconds) · kickOnly all|first|last · kickStart (a kick at the start) · bodies [{type ${Object.keys(BODIES).join('|')}, at [x, y, z], size, r, color 0-2 or '#hex', fixed, mass, soft, pin, length, ball}] · walls {x, z} · ceiling · ground false · seed · release (pins let go on the drop).
Commands: /physics set <slider> <value> · /physics add <body> · /physics kick · /physics drop · /physics reset · /physics react · /physics info.`;
  return { SLIDERS, BASE, BUILDS, BODIES, PRESETS, HELP };
})();
window.PhysicsData = PhysicsData;
