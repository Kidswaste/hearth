// MCP server for the Three Director: Claude writes and runs three.js sketches in the hub's Lab
// from the user's descriptions, checks the console and looks at the result.
const { serve } = require('./common');

const GUIDE = `The user describes scenes in words; you build them as three.js sketches in the hub's Three.js Lab, which they watch live next to this chat. Most of what they make are music visualizers for short videos.
Sketches are ES modules: import * as THREE from 'three' and addons from 'three/addons/...' (e.g. 'three/addons/controls/OrbitControls.js', 'three/addons/postprocessing/EffectComposer.js'). Create your own WebGLRenderer, append renderer.domElement to document.body, size it to innerWidth/innerHeight, handle resize, and animate with renderer.setAnimationLoop((now) => …) (time in ms). Don't use THREE.Clock (deprecated).
Workflow: three_set_code with a complete sketch → read the console/errors it returns → three_screenshot to see the result → refine. Keep going until it matches the request.

FRAME: the user picks the output size with buttons (Fit, 9:16 = 1080×1920, 16:9, 1:1, 4:5); reports tell you the current "frame". In exact sizes innerWidth/innerHeight ARE the output pixels and devicePixelRatio is 1. Compose for that frame (vertical 9:16: keep the subject in the middle, away from the top 12% and bottom 22% where Shorts/TikTok put titles and captions). You can switch it with three_set_frame when they ask for a format.

SLIDERS (always): every sketch must expose its main settings as clearly named sliders with the global tweak() helper, near the top of the code. The user does not write code; sliders are how they shape the result, so make them understandable:
  const P = tweak({
    style:      { value: 'rings', options: ['rings', 'bars', 'particles'], label: 'Visual style', group: 'Look' },
    bassPunch:  { value: 1.2, min: 0, max: 3, label: 'Bass punch', group: 'Music', hint: 'How hard shapes jump on kicks' },
    smoothing:  { value: 0.6, min: 0, max: 0.95, label: 'Smoothing', group: 'Music', hint: 'Higher = calmer, slower reactions' },
    glowColor:  { value: '#ff3cac', label: 'Glow color', group: 'Color' },
    spin:       { value: 0.3, min: -2, max: 2, label: 'Spin speed', group: 'Motion' },
    bloom:      { value: 1.1, min: 0, max: 3, label: 'Glow strength', group: 'Look' },
    showGrid:   { value: false, label: 'Floor grid', group: 'Look' },
  });
  Shorthand also works: name: [value, min, max] or [value, min, max, step], '#rrggbb' for colors, true/false for switches.
  Use 6–12 controls in groups like Music, Motion, Shape, Color, Camera, Look; plain-language labels; a hint when the effect isn't obvious; sensible min/max (the full range should still look OK); options lists for styles/modes.
  Read P.x every frame (in the animation loop) so moving a slider changes the scene instantly, e.g. mat.color.set(P.glowColor); bloomPass.strength = P.bloom. Things that need rebuilding (counts, geometry detail, a style switch that creates different objects) can be read at setup: the Lab re-runs the sketch automatically as the user drags. For expensive rebuilds you can also use { value, min, max, onChange: (v) => … }.
  The user can also link any number slider to the music themselves (♪ button), so prefer clean base values over hard-coding the reactivity amount.

MUSIC: the user loads an mp3/mp4 in the Lab (or you load one with three_load_media). Sketches read it through globals:
  audio.bass / audio.mid / audio.treble / audio.level  — 0..1 right now
  audio.beat     — 1 on each beat, fading to 0 (~150 ms), from the Lab's beat tracker
  audio.spectrum — Uint8Array(1024) FFT magnitudes (0..255), audio.waveform — Float32Array(2048), -1..1
  audio.band(lowHz, highHz) — 0..1 average of any range (e.g. audio.band(40, 90) for kicks)
  audio.time / audio.duration / audio.playing / audio.bpm
  audio.analysis — the whole track: { bpm, beats: [seconds], drops: [seconds], sections: [{ start, end, energy: 'quiet'|'medium'|'loud' }], fps: 30, level/bass/mid/treble: [0..1 per 1/30 s] } so you can anticipate drops: e.g. const loud = audio.analysis?.sections?.find(s => audio.time >= s.start && audio.time < s.end)?.energy === 'loud'.
  media.video / media.texture() — for an mp4, the playing video element and a THREE.VideoTexture of it.
  Without a file, audio gives a soft 120 bpm demo beat (audio.simulated = true), so always design so it still looks good.
  Smooth the raw values yourself (e.g. lerp toward them with the Smoothing slider) and scale them with sliders. Use three_media_info to learn the track (tempo, drops, quiet/loud sections) and three_media_control to jump to a drop before taking a screenshot.`;

const TOOLS = [
  { name: 'three_get_code', description: 'Current sketch name, frame size, code, named sliders with their current values (and music links), and any slider changes the user has not saved.', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_set_code', description: 'Replace the current sketch with complete code and run it. Returns console output, errors (with line numbers), performance stats, the frame size, the sliders it found and the loaded music. The previous code is kept in the sketch history.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, wait: { type: 'number', description: 'Seconds to let it run before reporting (default 2.5)' } }, required: ['code'] } },
  { name: 'three_new_sketch', description: 'Create a new named sketch with this code, open it and run it (keeps the user\'s other sketches untouched).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' } }, required: ['name', 'code'] } },
  { name: 'three_screenshot', description: 'Image of what the sketch shows right now (at the current frame size).', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_console', description: 'Recent console lines and errors from the running sketch, plus fps/draw-call stats, sliders, frame size and music.', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_media_info', description: 'The music/video loaded in the Lab: file, duration, tempo (bpm), beat count, drops, quiet/medium/loud sections and the energy of bass/mids/highs every 5 seconds, plus the playhead.', inputSchema: { type: 'object', properties: {} } },
  { name: 'three_load_media', description: 'Load an audio or video file (mp3, wav, m4a, mp4, mov, webm…) from the user\'s computer into the Lab by absolute path, analyze it and return the same info as three_media_info.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'three_media_control', description: 'Play, pause or jump in the loaded music (e.g. seek to a drop, play, then take a screenshot), or set the A–B loop the user works on (action "loop" with time = start and end; no time clears it). The user can lock their loop; then leave it alone.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'pause', 'seek', 'loop'] }, time: { type: 'number', description: 'Seconds: where to seek, or the loop start' }, end: { type: 'number', description: 'Loop end in seconds' } }, required: ['action'] } },
  { name: 'three_set_frame', description: 'Set the preview/output frame: "fit" (any size), "9:16" (1080×1920, Shorts/Reels/TikTok), "16:9" (1920×1080), "1:1" (1080×1080) or "4:5" (1080×1350).', inputSchema: { type: 'object', properties: { size: { type: 'string', enum: ['fit', '9:16', '16:9', '1:1', '4:5'] } }, required: ['size'] } },
];

serve({ name: 'three-lab', instructions: GUIDE, tools: TOOLS });
