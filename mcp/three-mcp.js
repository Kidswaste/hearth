// MCP server for the Three Director: Claude (or Astra) writes and runs three.js sketches in the hub's Lab from the
// user's descriptions, checks the console and looks at the result.
// Token budget: the tool list + instructions ride along with every message, so the tools the owner's director
// really uses (eval, edit, screenshot, read, search, sliders…) are their own tools with short descriptions, and the
// rest share one multi-command tool, three_do. HUB_TOOL_MODE=full (agent.toolMode 'full') lists every tool on its
// own and sends the whole guide, like before. Old tool names keep working either way (the hub routes them).
const { serve } = require('./common');
const G = require('./three-guide');

const FULL = process.env.HUB_TOOL_MODE === 'full';
// A layer reference (name, id, number from the bottom, "top", "bottom", "selected") is explained once, in three_do (lean) or
// in the layer tools (full), not in every schema.
const LAYER = {};
const LAYER_D = { description: 'name, id, number (1 = bottom), "top", "bottom" or "selected"' };
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });

// ---------- the everyday tools (own entries in both modes) ----------
const CORE_TOOLS = [
  { name: 'three_eval', description: 'Run JS inside the live preview (expression, or statements with return; await works) and get the value; three.js objects come back summarized. __scenes[layer name] = { scene, camera, renderer }; window.game etc. if the code exposes them. Results over max chars (default 3000) are cut. samples: n with every: ms returns n values over time (watch something react).',
    inputSchema: obj({ code: { type: 'string' }, max: { type: 'number' }, samples: { type: 'number' }, every: { type: 'number' } }, ['code']) },
  { name: 'three_edit_code', description: 'Change code and re-run: edits [{ find, replace, all? } | { lines: [from, to], replace }] in order (find = exact text, must match once unless all). An edit can name its own layer (batch across layers). Returns a short diff, errors, new console lines and fps; shot: true adds a small preview; report: "full" the whole Lab report.',
    inputSchema: obj({ layer: LAYER, edits: { type: 'array', items: { type: 'object' } }, shot: { type: 'boolean' }, report: { type: 'string', enum: ['compact', 'full'] }, wait: { type: 'number' } }, ['edits']) },
  { name: 'three_screenshot', description: 'Picture of the preview. size: small (512) | medium (1024, default) | large (1280); region [x, y, w, h] 0..1 crops; at: seconds, "drop", "kick", "snare", "hit" or a cue name seeks the song first; compare: true sets it beside the previous screenshot; frames: n (2–8) = a strip of n frames every gap s (default 0.5). An unchanged view comes back as a note (force: true sends it).',
    inputSchema: obj({ size: { type: 'string', enum: ['small', 'medium', 'large'] }, region: { type: 'array', items: { type: 'number' } }, at: {}, compare: { type: 'boolean' }, frames: { type: 'number' }, gap: { type: 'number' }, force: { type: 'boolean' } }) },
  { name: 'three_read_code', description: 'Read a layer\'s code with line numbers (default: selected layer, lines 1–250); from / to read further, or around: line ± 20.',
    inputSchema: obj({ layer: LAYER, from: { type: 'number' }, to: { type: 'number' }, around: { type: 'number' } }) },
  { name: 'three_search_code', description: 'Find text (regex: true for a regex) in every layer (or one). Returns matches by layer with line numbers and trimmed context (default 1 line, max 40 hits).',
    inputSchema: obj({ pattern: { type: 'string' }, layer: LAYER, regex: { type: 'boolean' }, context: { type: 'number' }, max: { type: 'number' } }, ['pattern']) },
  { name: 'three_sliders', description: 'Read or move a layer\'s tweak() sliders without changing code, like the user dragging them: set { key or label: value } (number, \'#rrggbb\', bool or option). Shown as unsaved (the user saves, undoes or compares). Locked sliders are skipped. Returns sliders + saved looks.',
    inputSchema: obj({ layer: LAYER, set: { type: 'object' } }) },
  { name: 'three_set_code', description: 'Replace the selected layer\'s code with a complete sketch and run it (the old code stays in history). Returns errors (with lines), console, fps, frame, sliders found and music; report: "full" for everything.',
    inputSchema: obj({ code: { type: 'string' }, wait: { type: 'number', description: 'seconds before reporting (default 2.5)' }, report: { type: 'string', enum: ['compact', 'full'] } }, ['code']) },
  { name: 'three_get_code', description: 'The selected layer\'s code (an outline with line numbers past 350 lines), the layers, frame size, sliders with values and music links, and slider changes the user hasn\'t saved.', inputSchema: obj({}) },
  { name: 'three_console', description: 'Errors, recent console lines and fps / draw calls of the running sketch; full: true adds sliders, layers and music.', inputSchema: obj({ full: { type: 'boolean' } }) },
  { name: 'three_media_control', description: 'Play, pause or seek the loaded music (time in s), or set the A–B loop (action "loop", time = start, end; no time clears; leave a locked loop alone).',
    inputSchema: obj({ action: { type: 'string', enum: ['play', 'pause', 'seek', 'loop'] }, time: { type: 'number' }, end: { type: 'number' } }, ['action']) },
  { name: 'three_input', description: 'Play-test in the preview, in order: { key: "ArrowLeft", ms } holds a key, { keys: ["w", "Shift"], ms }, { click: [x, y] } (0..1 across the view), { move: [x, y] }, { wait: ms }. screenshot: true returns a picture after.',
    inputSchema: obj({ actions: { type: 'array', items: { type: 'object' } }, screenshot: { type: 'boolean' } }, ['actions']) },
  { name: 'three_contact_sheet', description: 'One image with a numbered, timed frame at each of the user\'s cues (or count frames over the loop / song, or the given times in s). Use it to judge the whole piece (intro → drop → outro).',
    inputSchema: obj({ times: { type: 'array', items: { type: 'number' } }, count: { type: 'number' } }) },
];

// ---------- the rest: own tools in full mode, three_do commands in lean mode ----------
const TEMPLATES = ['empty', 'rings', 'particles', 'ascii', 'datamosh', 'vhs', 'glitch', 'crt', 'pixelate', 'halftone', 'film', 'kaleido', 'edges', 'thermal', 'duotone', 'glow'];
const MORE_TOOLS = [
  { name: 'three_layers', description: 'The layers (bottom first): selected, visibility, opacity, blend, time range on the song, transform, placements, sliders.', inputSchema: obj({}) },
  { name: 'three_select_layer', description: 'Select a layer (code tools then default to it). Returns its code.', inputSchema: obj({ layer: LAYER_D }, ['layer']) },
  { name: 'three_add_layer', description: 'Add a layer (on top unless position), select and run it: complete transparent code, or a template (scenes: empty, rings, particles; filters that restyle the layers below: ascii, datamosh, vhs, glitch, crt, pixelate, halftone, film, kaleido, edges, thermal, duotone, glow). settings like update_layer.',
    inputSchema: obj({ name: { type: 'string' }, code: { type: 'string' }, template: { type: 'string', enum: TEMPLATES }, position: { description: '"top", "bottom" or n (1 = bottom)' }, settings: { type: 'object' }, wait: { type: 'number' } }) },
  { name: 'three_update_layer', description: 'Change a layer: settings { in, out (s on the song, null = whole song), fadeIn, fadeOut, opacity 0..1, blend (normal|add|screen|lighten|overlay|soft-light|multiply|darken|difference|exclusion|color-dodge), x, y (% of frame), scale, rotate (deg), visible, name }, order ("top", "bottom", n), and/or code (complete module).',
    inputSchema: obj({ layer: LAYER, settings: { type: 'object' }, order: {}, code: { type: 'string' }, wait: { type: 'number' } }, ['layer']) },
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
  { name: 'three_media_info', description: 'The loaded music / video: file, duration, bpm, beats, drops, sections, energy every 5 s, markers, playhead (and live input / what\'s playing).', inputSchema: obj({}) },
  { name: 'three_load_media', description: 'Load an audio / video file by absolute path into the Lab and analyze it.', inputSchema: obj({ path: { type: 'string' } }, ['path']) },
  { name: 'three_set_frame', description: 'Set the output frame: fit, 9:16 (1080×1920), 16:9, 1:1, 4:5 (1080×1350).', inputSchema: obj({ size: { type: 'string', enum: ['fit', '9:16', '16:9', '1:1', '4:5'] } }, ['size']) },
  { name: 'three_new_sketch', description: 'Create, open and run a new named sketch (the user\'s other sketches stay untouched).', inputSchema: obj({ name: { type: 'string' }, code: { type: 'string' } }, ['name', 'code']) },
];
const NODES_TOOL = { name: 'three_nodes', description: 'Edit the selected layer as a node graph (the user\'s Nodes view; it compiles to the layer code, knobs = sliders). command: "presets", "types [filter]", "list", "preset|new|layer <preset>", "add <type> [field=value…] [to=node.input]", "link <node.output> <node.input>", "unlink <node.input>", "set <node> field=value…", "rm <node…>", "layout", "rebuild". Layers made with nodes: edit them here, not with three_edit_code.', inputSchema: obj({ command: { type: 'string' } }, ['command']) };

const DO_CMDS = ['layers', 'select_layer', 'add_layer', 'update_layer', 'remove_layer', 'keyframes', 'animate', 'timeline', 'timeline_edit', 'looks', 'notes', 'references', 'triggers', 'media_info', 'load_media', 'set_frame', 'new_sketch', 'help'];
const DO_TOOL = {
  name: 'three_do',
  description: `More Lab actions: { cmd, ...args }. layer = name, id, number (1 = bottom), "top", "bottom" or "selected".
layers · select_layer {layer} · remove_layer {layer} (undoable)
add_layer {name, code | template, position, settings} (templates: empty rings particles; filters on what's below: ${TEMPLATES.slice(3).join(' ')})
update_layer {layer, settings: {in, out, fadeIn, fadeOut, opacity, blend, x, y, scale, rotate, visible, name}, order, code}
keyframes {layer, property, keys: [{time, value, ease}] | clear} · animate {layer, preset}
timeline {from, to} · timeline_edit {grid, markers, loop, zoom, cues, speed, lane}
looks {action: list|save|apply|delete, name} · notes {action: list|done|reopen|edit|delete|add, id, time, text}
references {action: list|add|rename|remove|palette, path, name, to, from, colors}
triggers {set} · media_info · load_media {path} · set_frame {size: fit|9:16|16:9|1:1|4:5} · new_sketch {name, code}
help {topic} explains any of these.`,
  inputSchema: { type: 'object', properties: { cmd: { type: 'string', enum: DO_CMDS } }, required: ['cmd'] },
};

const tools = [...CORE_TOOLS, ...(FULL ? MORE_TOOLS : [DO_TOOL]), ...(process.env.HUB_NODES_TOOL ? [NODES_TOOL] : [])];
// three_do help is answered here, without a trip to the hub.
const local = { three_do: (args) => (args.cmd === 'help' ? { ok: true, value: G.help(args.topic) } : null) };

// three_nodes costs ~90 tokens per message, so it's only offered when the agent opts in (agent.nodesTool, `/nodes-director on`).
module.exports = serve({ name: 'three-lab', instructions: '', guide: FULL ? G.FULL : G.CORE, tools, local, all: [...CORE_TOOLS, ...MORE_TOOLS, DO_TOOL, NODES_TOOL], doCommands: DO_CMDS }, module);
