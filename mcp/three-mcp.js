// MCP server for the Three Director: Claude (or Astra) writes and runs three.js sketches in the hub's Lab from the
// user's descriptions, checks the console and looks at the result.
// Token budget: the tool list + instructions ride along with every message, so the tools the owner's director
// really uses (eval, edit, screenshot, read, search, sliders…) are their own tools with short descriptions, and the
// rest share one multi-command tool, three_do. HUB_TOOL_MODE=full (agent.toolMode 'full') lists every tool on its
// own and sends the whole guide, like before. Old tool names keep working either way (the hub routes them).
const { serve } = require('./common');
// the guide (and the app map it requires) loads only when a help topic is asked or the hub reads .guide (round 21)
let G0 = null;
const G = () => (G0 ||= require('./three-guide'));

const FULL = process.env.HUB_TOOL_MODE === 'full';
// A layer reference (name, id, number from the bottom, "top", "bottom", "selected") is explained once, in three_do (lean) or
// in the layer tools (full), not in every schema.
const LAYER = {};
const LAYER_D = { description: 'name, id, number (1 = bottom), "top", "bottom" or "selected"' };
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });

// ---------- the everyday tools (own entries in both modes) ----------
const TEMPLATES = ['empty', 'rings', 'particles', 'ascii', 'datamosh', 'vhs', 'glitch', 'crt', 'pixelate', 'halftone', 'film', 'kaleido', 'edges', 'thermal', 'duotone', 'glow'];
const CORE_TOOLS = [
  // every new element or effect is a new layer (the owner's rule), so this is an everyday tool, not a three_do command
  { name: 'three_add_layer', description: 'A NEW layer per new element or effect (top unless position: "top", "bottom", n), selected and run: complete code (alpha: true, no background) or a template (filters restyle the layers below). settings as update_layer. Returns its sliders.',
    inputSchema: obj({ name: { type: 'string' }, code: { type: 'string' }, template: { type: 'string', enum: TEMPLATES }, position: {}, settings: { type: 'object' } }) },
  { name: 'three_eval', description: 'Run JS in the live preview (an expression, or statements with return; await works); three.js objects come back summarized. __scenes[layer name] = { scene, camera, renderer }. Cut at max chars (3000). samples: n, every: ms = n values over time.',
    inputSchema: obj({ code: { type: 'string' }, max: { type: 'number' }, samples: { type: 'number' }, every: { type: 'number' } }, ['code']) },
  { name: 'three_edit_code', description: 'Change code, re-run only that layer: edits [{ find, replace, all? } | { lines: [from, to], replace }] in order (find: exact text, once unless all); an edit may name its own layer. Answers when the change is on screen: where it landed, errors (layer + line), new console lines, fps. shot: true adds a small picture; safe: true undoes it if it breaks; diff: true shows the diff.',
    inputSchema: obj({ layer: LAYER, edits: { type: 'array', items: { type: 'object' } }, shot: { type: 'boolean' }, safe: { type: 'boolean' }, diff: { type: 'boolean' } }, ['edits']) },
  { name: 'three_screenshot', description: 'Picture of the preview: size small 512 (default) | medium 768 | large 1280 (a later picture in the same reply with no size: 384); region [x, y, w, h] 0..1 crops; at: s, "drop", "kick", "snare", "hit" or a cue (seeks first); compare: true = beside the previous one; frames: 2–8 = a strip every gap s (0.5). An unchanged view is a note (force: true sends it).',
    inputSchema: obj({ size: { type: 'string', enum: ['small', 'medium', 'large'] }, region: { type: 'array', items: { type: 'number' } }, at: {}, compare: { type: 'boolean' }, frames: { type: 'number' }, gap: { type: 'number' }, force: { type: 'boolean' } }) },
  { name: 'three_read_code', description: 'Read a layer\'s code with line numbers (default: selected layer, lines 1–250); from / to read further, or around: line ± 20.',
    inputSchema: obj({ layer: LAYER, from: { type: 'number' }, to: { type: 'number' }, around: { type: 'number' }, force: { type: 'boolean' } }) },
  { name: 'three_search_code', description: 'Find text (regex: true) in every layer (or one): matches by layer, line numbers, context lines (1), max hits (40).',
    inputSchema: obj({ pattern: { type: 'string' }, layer: LAYER, regex: { type: 'boolean' }, context: { type: 'number' }, max: { type: 'number' } }, ['pattern']) },
  { name: 'three_sliders', description: 'Read or move a layer\'s tweak() sliders as the owner would (no code change): set { key or label: value }, shown unsaved; locked ones skipped. Returns sliders + looks.',
    inputSchema: obj({ layer: LAYER, set: { type: 'object' } }) },
  { name: 'three_set_code', description: 'Rewrite the selected layer with a complete module and run it (undoable): for an empty sketch, or when the owner asks to rewrite this layer; new elements go in a new layer. Returns errors (layer + line), console, fps, sliders; report: "full" for everything.',
    inputSchema: obj({ code: { type: 'string' }, report: { type: 'string', enum: ['compact', 'full'] } }, ['code']) },
  { name: 'three_get_code', description: 'The scene outline (one line per layer, frame) and the selected layer\'s code (an outline past 160 lines; one line when you already have it unchanged, else only the changed lines), sliders and unsaved slider changes.', inputSchema: obj({}) },
  { name: 'three_console', description: 'Errors, recent console lines and fps / draw calls of the running sketch; full: true adds sliders, layers and music.', inputSchema: obj({ full: { type: 'boolean' } }) },
  { name: 'three_media_control', description: 'Music: play, pause, seek (time s), loop (time = start, end; none clears; leave a locked loop). Footage: frame (n | "f120" | timecode), step n, read (exact frame; see: picture).',
    inputSchema: obj({ action: { type: 'string', enum: ['play', 'pause', 'seek', 'loop', 'frame', 'step', 'read'] }, time: { type: 'number' }, end: { type: 'number' }, frame: {}, n: { type: 'number' }, see: { type: 'boolean' } }, ['action']) },
  { name: 'three_input', description: 'Play-test the preview, in order: { key: "ArrowLeft", ms } (held), { keys: ["w", "Shift"], ms }, { click: [x, y] } (0..1), { move: [x, y] }, { wait: ms }; screenshot: true after.',
    inputSchema: obj({ actions: { type: 'array', items: { type: 'object' } }, screenshot: { type: 'boolean' } }, ['actions']) },
  { name: 'three_contact_sheet', description: 'One image of numbered, timed frames at the owner\'s cues (or count over the loop / song, or times in s).',
    inputSchema: obj({ times: { type: 'array', items: { type: 'number' } }, count: { type: 'number' } }) },
];


const MORE_TOOLS = [
  { name: 'three_layers', description: 'The layers (bottom first): selected, visibility, opacity, blend, time range on the song, transform, placements, sliders.', inputSchema: obj({}) },
  { name: 'three_select_layer', description: 'Select a layer (code tools then default to it). Returns its code.', inputSchema: obj({ layer: LAYER_D }, ['layer']) },
  { name: 'three_update_layer', description: 'Change a layer: settings { in, out (s on the song, null = whole song), fadeIn, fadeOut, opacity 0..1, blend (normal|add|screen|lighten|overlay|soft-light|multiply|darken|difference|exclusion|color-dodge), x, y (% of frame), scale, rotate (deg), visible, name }, order ("top", "bottom", n), and/or code (complete module).',
    inputSchema: obj({ layer: LAYER, settings: { type: 'object' }, order: {}, code: { type: 'string' }, wait: { type: 'number' } }, ['layer']) },
  { name: 'three_undo', description: 'Undo your last code change (force: true even if the layer changed since).', inputSchema: obj({ force: { type: 'boolean' } }) },
  { name: 'three_remove_layer', description: 'Remove a layer (the user can undo it).', inputSchema: obj({ layer: LAYER }, ['layer']) },
  { name: 'three_keyframes', description: 'Animate a layer property over the song (replaces its keys; clear: true removes them). property: opacity, x, y, scale, rotate or a slider (key or label). keys [{ time (s), value, ease: ease|linear|hold|curve, c? }].',
    inputSchema: obj({ layer: LAYER, property: { type: 'string' }, keys: { type: 'array', items: { type: 'object' } }, clear: { type: 'boolean' } }, ['layer', 'property']) },
  { name: 'three_animate', description: 'Animation preset on a layer (over its time, the loop or the song): fadeIn, fadeOut, popIn, slideLeft, slideRight, slideUp, slideDown, zoom, spin, pulse (beats), shake (kicks), blink (snares).',
    inputSchema: obj({ layer: LAYER, preset: { type: 'string' } }, ['layer', 'preset']) },
  { name: 'three_timeline', description: 'Grid, kick / snare / hit markers, cues, loop, zoom, layer time ranges, keyframes, lanes and notes. from / to (s) limit the markers.', inputSchema: obj({ from: { type: 'number' }, to: { type: 'number' } }) },
  { name: 'three_timeline_edit', description: 'Change the timeline: grid ("auto" | { bpm, downbeat, beatsPerBar }), markers ({ add|remove: { kick: [s] }, clear: [names], range, snap }), loop ({ start, end } | null), zoom, cues ({ add: [{ time, name, looks }], remove, clear }), speed, lane ({ layer, property, show }). Only change the user\'s grid / markers when asked.',
    inputSchema: obj({ grid: {}, markers: { type: 'object' }, loop: {}, zoom: {}, lane: { type: 'object' }, cues: { type: 'object' }, speed: { type: 'number' } }) },
  { name: 'three_looks', description: 'Saved slider looks: action list (default) | save | apply | delete with name.', inputSchema: obj({ action: { type: 'string', enum: ['list', 'save', 'apply', 'delete'] }, name: { type: 'string' }, layer: LAYER }) },
  { name: 'three_notes', description: 'The user\'s notes on moments: action list (default, with open notes\' screenshots) | done | reopen | edit (text) | delete with id | add (time, text).',
    inputSchema: obj({ action: { type: 'string', enum: ['list', 'done', 'reopen', 'edit', 'delete', 'add'] }, id: { type: 'string' }, time: { type: 'number' }, text: { type: 'string' } }) },
  { name: 'three_references', description: 'The sketch\'s reference files: action list (default, with pictures) | add (path of a chat attachment, name?) | rename (name, to) | remove (name) | palette (from: picture name, colors: [...] or coolors: link). In code: refTexture(\'name\'), refs.name (URL).',
    inputSchema: obj({ action: { type: 'string', enum: ['list', 'add', 'rename', 'remove', 'palette'] }, path: { type: 'string' }, name: { type: 'string' }, to: { type: 'string' }, from: { type: 'string' }, colors: { type: 'array', items: { type: 'string' } }, coolors: { type: 'string' } }) },
  { name: 'three_triggers', description: 'The user\'s ⚡ Triggers (which band fires kick / bass / snare / hats / hit without markers or in live sound). set: { hats: { lo, hi (Hz), thr (0..1), gap (ms), on } } changes some; only when asked.', inputSchema: obj({ set: { type: 'object' } }) },
  { name: 'three_media_info', description: 'The loaded song / video: file, duration, beat grid (and how sure), labeled sections, drops, hits found in the audio, style, energy every 5 s, the owner\'s markers, playhead (and live input / what\'s playing).', inputSchema: obj({}) },
  { name: 'three_load_media', description: 'Load an audio / video file by absolute path into the Lab and analyze it.', inputSchema: obj({ path: { type: 'string' } }, ['path']) },
  { name: 'three_set_frame', description: 'Set the output frame: fit, 9:16 (1080×1920), 16:9, 1:1, 4:5 (1080×1350).', inputSchema: obj({ size: { type: 'string', enum: ['fit', '9:16', '16:9', '1:1', '4:5'] } }, ['size']) },
  { name: 'three_new_sketch', description: 'Create, open and run a new named sketch (the user\'s other sketches stay untouched).', inputSchema: obj({ name: { type: 'string' }, code: { type: 'string' } }, ['name', 'code']) },
  { name: 'three_run', description: 'Run a Lab / music / nodes / video chat command, e.g. "/make-it-react" or "/size 9:16"; returns what it printed.', inputSchema: obj({ command: { type: 'string' } }, ['command']) },
  { name: 'three_task', description: 'This chat\'s task state kept by Hearth (goal, what was done, layers, open todos); todo: [...] replaces the open todos.', inputSchema: obj({ todo: { type: 'array', items: { type: 'string' } } }) },
  { name: 'three_help', description: 'The app map and the Lab guide by topic: app, lab, nodes, react, commands, handoff, habits, video.', inputSchema: obj({ topic: { type: 'string' } }) },
  { name: 'three_sequence', description: 'The Lab sequence: a video timeline of scenes (sketches), footage, titles, overlays and the song. op: status | new | open | add {scene | footage | title | overlay | song, at: s | "bar 9" | "f120", bars | secs, look} | transition {clip, type} | length | trim | split | delete | move | slip | look | fit | seek | frame {at} | play | render {format} | editor | back | undo | arrange {template} | versions (op "help"). Each scene has its own.',
    inputSchema: obj({ op: { type: 'string' }, clip: {}, at: {}, scene: { type: 'string' }, type: { type: 'string' }, format: { type: 'string' }, template: { type: 'string' } }, ['op']) },
  { name: 'three_comp', description: 'Precomps: other scenes (other chats\', sketches, sequences) as live layers of this scene, and parts dispatched to other chats at once (help comp). op: list | add {source, layout} | set {layer, start, speed, loop, crop, mask, blur…} | key {layer, property, keys} | remove | render | dispatch {parts: [{brief, engine}], layout} | parts | feedback {part, text} | again | swap.',
    inputSchema: obj({ op: { type: 'string' }, source: { type: 'string' }, layer: {}, layout: { type: 'string' }, parts: { type: 'array', items: { type: 'object' } }, part: {}, text: { type: 'string' }, property: { type: 'string' }, keys: { type: 'array', items: { type: 'object' } } }, ['op']) },
  { name: 'three_motion', description: 'Motion-design kit (help motion): op list {family} | add {preset, words, pics, values, in, out} | hearth {layout, frame, words} (Put Hearth on screen) | words {layer, text} | set {layer, values} | seq {preset, at, secs} | intro; the owner\'s camera as an input: camera | track | follow | look (help webcam).',
    inputSchema: obj({ op: { type: 'string' }, preset: { type: 'string' }, words: { type: 'string' }, layer: { type: 'string' }, values: { type: 'object' }, family: { type: 'string' } }, ['op']) },
  { name: 'three_model', description: '3D model layers (help model): op list | add {file|item} | replace | set {values} | material {preset} | look | light | sky {query|file} | ground | clip {name, speed} | clipfile | move {preset, at, secs} | turntable | explode | fx | react | fit | lite | info.',
    inputSchema: obj({ op: { type: 'string' }, file: { type: 'string' }, item: { type: 'string' }, preset: { type: 'string' }, layer: { type: 'string' }, values: { type: 'object' }, query: { type: 'string' }, name: {}, at: { type: 'number' }, secs: { type: 'number' } }, ['op']) },
  { name: 'three_footage', description: 'Video footage frame by frame and its cut list (the sketch plays the parts). action: info | cuts | split | delete | restore | speed | hold (value) | keep (from, to) | clear | cut_scenes | cue | sheet | scenes | motion | pacing / match (ref: a reference clip; its rhythm, never its footage) | editor; frame: n, "f120" or timecode.',
    inputSchema: obj({ action: { type: 'string' }, frame: {}, value: {}, ref: { type: 'string' }, from: {}, to: {}, mode: { type: 'string' }, cut: { type: 'boolean' } }) },
];
// On by default for Three directors (the owner wants a node view of visual work; `/nodes-director off` drops it).
const NODES_TOOL = { name: 'three_nodes', description: 'Layers as node graphs (the Nodes view). command: layer <preset> (new layer) · presets · types [word] · list · add <type> k=v [to=n.in] · link a.out b.in · unlink b.in · set <n> k=v · rm <n> · preset <p> (replace) · rebuild. help nodes.', inputSchema: obj({ command: { type: 'string' } }, ['command']) };

// add_layer stays a command (older habits keep working) but is described as its own tool now
const DO_CMDS = ['layers', 'batch', 'contact_sheet', 'input', 'undo', 'crew', 'select_layer', 'add_layer', 'update_layer', 'remove_layer', 'keyframes', 'animate', 'timeline', 'timeline_edit', 'looks', 'notes', 'references', 'triggers', 'media_info', 'load_media', 'set_frame', 'new_sketch', 'run', 'task', 'footage', 'sequence', 'motion', 'model', 'comp', 'make', 'asset', 'particles', 'shader', 'type', 'physics', 'autoedit', 'loop', 'help'];
// (round 25, diet) three_do names its commands, grouped; each one's details come from three_do help <cmd> (DO_HELP,
// MORE_TOOLS, the guide topics), answered here without a hub call. Was ≈ 370 tokens per message.
const DO_TOOL = {
  name: 'three_do',
  description: `More Lab actions: {cmd, ...args}. help {topic}: any cmd's args (topic = cmd), a guide topic, or app. layer = name|id|n (1 = bottom)|top|bottom|selected.
batch {ops: [{cmd, ...}]} several calls in one, in order · undo {force} your last code change
Look: contact_sheet {count | times} the song as one picture · input {actions} play-test
Layers: layers select_layer remove_layer update_layer keyframes animate looks references
Time: timeline timeline_edit triggers media_info load_media footage sequence autoedit loop
Make: new_sketch set_frame model motion particles shader type physics asset comp crew make task notes
run {command: "/grade noir"} any chat command`,
  inputSchema: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
};
// the commands that have no own tool in full mode: their help line (round 25)
const DO_HELP = {
  batch: 'batch {ops: [{cmd, ...args}, …]}: several Lab actions in one call, in order; an op is any three_do cmd or everyday tool by its short name (screenshot, sliders, edit_code…).',
  undo: 'undo {force}: your last code change back, no code re-sent (force: even if the layer changed since).',
  crew: 'crew {op: start {n: 2–6, brief, angles: [one per helper]} | status | pick {n, reason} | undo | keep {n} | stop | code {n, layer} | copy {from, layer}}: variation helpers on backstage copies of this scene (the owner approves the cost first; only with /crew on).',
  make: 'make {op: plan|list, text}: name and plan what you are about to create (rooms ahead of time, progress).',
  asset: 'asset {op: find {q, kind, limit} | use {id|q, as} | free {q, source: polyhaven|ambientcg, type} | get {source, id, type, size, use} | help}: the owner\'s asset library (textures, HDRIs, fonts, models, sounds).',
  particles: 'particles {op: list {filter} | add {preset, sliders} | set {layer, values} | emitter | look | react | info {layer} | help}: GPU particle layers.',
  autoedit: 'autoedit {op: plan {brief, fresh, format} | show | set {section: n, scene: name|new, brief, bars, trans, look, cuts, lyrics} | lyrics {text} | make | render {format: 9:16|16:9|1:1|all}}: a whole music video from the loaded song: a plan per section (scene, bars, transition on the beat, intensity, look, lyrics) the owner sees as a strip; make builds the Lab sequence (new scenes go to the crew, the owner approves the cost); render only when asked.',
  loop: 'loop {bars | secs | fade | check | render: loop|gif | off | status}: "make it loop" (Shorts): the timeline loops over N bars of the song (or N s) and the scene\'s clock wraps with it in the preview and renders (keyframes come back round); check: ≈ seamless or a visible jump (last frame vs first); fade: blend the last beat into the first; code that loops by itself: help loop.',
  shader: 'shader {op: list | add | glsl | channel | scale | info | check | help}: fragment-shader layers (GLSL, Shadertoy, ISF).',
};

// (round 25, diet) the everyday tools as the lean list sends them: short words, the details in help <tool>
// (round 46, promptdiet) only the args a typical call uses stay in the schema; the rarer ones are named in the words (the
// server passes every arg on, listed or not; help <tool> lists them all)
// (full mode keeps the long descriptions above). layer: {} = the reference three_do explains.
const S = { type: 'string' }; const B = { type: 'boolean' }; const N = { type: 'number' }; const A = { type: 'array' };
const LEAN = {
  three_add_layer: ['NEW layer per new element or effect (top; position: bottom|n), selected + run. code: complete module (alpha: true, no background) or template (help filters). settings as update_layer. Returns sliders.', { name: S, code: S, template: S, position: {}, settings: {} }],
  three_eval: ['Run JS in the live preview (expression, or statements with return; await ok). __scenes[layer] = {scene, camera, renderer}. max chars (3000); samples n every ms.', { code: S }],
  three_edit_code: ['Change code, re-run that layer: edits [{find, replace, all?} | {lines: [from, to], replace}] (an edit may name its layer). Answers once on screen: errors, console, fps. shot: small picture; safe: undo if it breaks; diff.', { layer: {}, edits: A, shot: B }],
  three_screenshot: ['Preview picture. size small|medium|large; region [x, y, w, h] 0..1; at: s|drop|kick|cue (seeks); compare: beside the last; frames 2–8 every gap s; force: even unchanged.', { size: S, region: A, at: {} }],
  three_read_code: ['A layer\'s numbered code (1–250); from / to, or around: line; force: even if you have it.', { layer: {}, from: N, to: N, force: B }],
  three_search_code: ['Find text (regex) in all layers or one: line numbers, context (1), max (40).', { pattern: S, layer: {} }],
  three_sliders: ['Read or move a layer\'s tweak() sliders (no code change): set {key: value}, unsaved for the owner.', { layer: {}, set: {} }],
  three_set_code: ['Rewrite the selected layer (complete module), run it, undoable: an empty sketch or when asked; new elements go in a new layer. report: full.', { code: S }],
  three_get_code: ['Scene outline + the selected layer\'s code (outline past 160 lines), unsaved slider values.', {}],
  three_console: ['Errors, console lines, fps / draw calls; full: + sliders, layers, music.', { full: B }],
  three_media_control: ['Music: play|pause|seek {time}|loop {time, end; none clears}. Footage: frame {frame: n|"f120"|timecode}|step {n}|read (see: picture).', { action: S, time: N }],
  three_input: ['Play-test, in order: {key, ms} held, {keys: [], ms}, {click: [x, y]} 0..1, {move: [x, y]}, {wait: ms}; screenshot: true = a picture after.', { actions: A }],
  three_contact_sheet: ['One image of numbered frames at the owner\'s cues (or count over loop / song, or times s).', {}],
};
const lean = (t) => (LEAN[t.name] ? { name: t.name, description: LEAN[t.name][0], inputSchema: obj(LEAN[t.name][1], t.inputSchema.required) } : t);

// (round 22, labcrew) HUB_TOOL_MODE=crew: a crew helper (tools/three-crew.js) works on its own copy of a scene,
// backstage, for a few calls: only the tools that work there and that a variation needs (lean words, round 25).
const CREW = process.env.HUB_TOOL_MODE === 'crew';
const CREW_TOOLS = ['three_edit_code', 'three_add_layer', 'three_set_code', 'three_read_code', 'three_screenshot', 'three_console'];
// (round 46, promptdiet) the two least used everyday tools (≈ 5 % of the owner's director calls) are three_do commands in
// the lean list (≈ 115 tokens less on every director step); their words come back with help; the hub gets the same names
const VIA_DO = ['three_input', 'three_contact_sheet'];
const tools = CREW ? CORE_TOOLS.filter((t) => CREW_TOOLS.includes(t.name)).map(lean)
  : [...(FULL ? CORE_TOOLS : CORE_TOOLS.filter((t) => !VIA_DO.includes(t.name)).map(lean)), ...(FULL ? MORE_TOOLS : [DO_TOOL]), ...(process.env.HUB_NODES_TOOL === '1' ? [NODES_TOOL] : [])];

// help <topic>: a tool or command by name gives its whole description + args (then the guide topic of the same name,
// if any); anything else goes to the guide / app map. (round 25)
const BY = Object.fromEntries([...CORE_TOOLS, ...MORE_TOOLS, NODES_TOOL].map((t) => [t.name.slice(6), t]));
function help(topic) {
  const k = String(topic || '').toLowerCase().trim().replace(/^three_/, '').replace(/[\s-]+/g, '_');
  const t = BY[k];
  const line = DO_HELP[k] || (t && `${t.name}${MORE_TOOLS.includes(t) || VIA_DO.includes(t.name) ? ` (lean: three_do ${k})` : ''}: ${t.description}\nargs: ${Object.keys(t.inputSchema.properties).join(', ') || 'none'}`);
  const guide = G().help(topic || 'app');
  if (!line) return guide;
  return /^Topics:/.test(guide) ? line : `${line}\n\n${guide}`;
}
// three_do help is answered here, without a trip to the hub.
const local = { three_do: (args) => (args.cmd === 'help' ? { ok: true, value: help(args.topic) } : null), three_help: (args) => ({ ok: true, value: help(args.topic || 'app') }) };

// three_nodes (≈ 75 tokens per message) is on for Three directors unless agent.nodesTool === false (engines.js sets HUB_NODES_TOOL).
module.exports = serve({ name: 'three-lab', instructions: '', get guide() { return CREW ? '' : FULL ? G().FULL : G().CORE; }, tools, local, all: [...CORE_TOOLS, ...MORE_TOOLS, DO_TOOL, NODES_TOOL], doCommands: DO_CMDS }, module);
