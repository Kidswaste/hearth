// MCP server for the Video Director: lets Claude look at renders in the hub's Video Review,
// annotate them, re-render with aerender and run After Effects scripts.
// How to work (scripts build the videos, look before judging, speak visually) is in the director's system prompt
// (engines.js); the descriptions here only say what each tool does. Times are seconds everywhere.
const { serve } = require('./common');
const MAP = require('./hearth-map');

const TOOLS = [
  { name: 'video_list', description: 'Recent renders the hub found, newest first (path, size, modified); search filters by path.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 20 }, search: { type: 'string' } } } },
  { name: 'video_status', description: 'What Video Review shows: file, resolution, duration, playhead, paused, and the user\'s timecoded notes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'video_open', description: 'Open a video in Video Review (the user sees it).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'video_frame', description: 'One frame of the open video as an image; time jumps there first (the user\'s playhead too).', inputSchema: { type: 'object', properties: { time: { type: 'number' } } } },
  { name: 'video_contact_sheet', description: 'One image of evenly spaced, time-labelled frames over the video (or from–to): the quick way to review a render.', inputSchema: { type: 'object', properties: { count: { type: 'integer', default: 12, minimum: 4, maximum: 24 }, from: { type: 'number' }, to: { type: 'number' } } } },
  { name: 'video_add_note', description: 'Pin a note on the user\'s timeline at a time.', inputSchema: { type: 'object', properties: { time: { type: 'number' }, text: { type: 'string' }, category: { type: 'string', enum: ['timing', 'color', 'text', 'motion', 'audio', 'framing', 'fx', 'general'] } }, required: ['time', 'text'] } },
  { name: 'video_compare', description: 'Compare the open video (A) with another file (B).', inputSchema: { type: 'object', properties: { path: { type: 'string' }, mode: { type: 'string', enum: ['wipe', 'side', 'onion', 'diff', 'flip'] } }, required: ['path'] } },
  { name: 'video_control', description: 'Drive the player; returns the status. seek (time), step (frames), loop (in, out; no in clears), speed / safe_zone (tiktok|reels|shorts|all|feed45|youtube|"") / guide / crop ("4:5"|"1:1"|"9:16"|"16:9"|null) / compare_mode / resolve_note (note number) take value.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'pause', 'seek', 'step', 'loop', 'speed', 'safe_zone', 'guide', 'crop', 'compare_mode', 'resolve_note'] }, time: { type: 'number' }, frames: { type: 'integer' }, in: { type: 'number' }, out: { type: 'number' }, value: {} }, required: ['action'] } },
  { name: 'video_export', description: 'ffmpeg export of the open video (or its loop) into exports/ next to it. preset: tiktok, reels, shorts, feed45, square, yt1080, yt1440, yt4k, x169, proxy, master, webm, gif; offset 0..1 = crop position.',
    inputSchema: { type: 'object', properties: { preset: { type: 'string' }, fit: { type: 'string', enum: ['crop', 'fit', 'blur'] }, offset: { type: 'number' }, range: { type: 'string', enum: ['auto', 'all'] } }, required: ['preset'] } },
  { name: 'ae_render', description: 'Render an .aep with aerender in the background (AE stays usable); waits, returns the result + log tail; the file then shows in Video Review. No comp = the project\'s render queue.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, comp: { type: 'string' }, output: { type: 'string' }, omTemplate: { type: 'string' } }, required: ['project'] } },
  { name: 'ae_run_script', description: 'Run ExtendScript inside After Effects (starts it if needed) as one undoable step; errors show as an AE alert.', inputSchema: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } }, required: ['code'] } },
  // the video editor (Video Review ✂, tools/video-edit-tools.js): read the edit, see an exact frame, change it
  { name: 'video_edit_read', description: 'The edit open in the video editor as text: format, fps, clips with timecodes and transitions, tracks / layers / titles, keyframes, markers with notes. what: all|clips|tracks|markers|presets (+ kind, search).',
    inputSchema: { type: 'object', properties: { what: { type: 'string', enum: ['all', 'clips', 'tracks', 'markers', 'presets'] }, kind: { type: 'string' }, search: { type: 'string' } } } },
  { name: 'video_edit_frame', description: 'Image of the edited program at an exact frame (frame number, or time: seconds / "00:00:04:12"), every layer composited; says which source frame each layer shows.',
    inputSchema: { type: 'object', properties: { frame: { type: 'integer' }, time: {}, width: { type: 'integer', default: 720 } } } },
  { name: 'video_edit', description: 'Change the edit, one undo step per call: op add|split|trim|move|delete|roll|slip|slide|transition|look|effect|sound|adjust|keyframe|motion|speed|ramp|reverse|set|marker|range|template|format|new|open|undo|redo|render|command. clip: 3 (main track) or "V2.1". {op:"help"} lists the fields. Mood-board references give a vibe, never footage, unless the owner says so.',
    inputSchema: { type: 'object', properties: { op: { type: 'string' }, clip: {}, at: {}, type: { type: 'string' }, path: { type: 'string' }, text: { type: 'string' }, preset: { type: 'string' } }, required: ['op'], additionalProperties: true } },
  // the app map (mcp/hearth-map.js), answered by this server without a trip to the hub
  { name: 'hearth_help', description: 'How Hearth (the owner\'s app) fits together and how Claude and Astra share a chat (Hearth keeps its task state), by topic: app, video, editor, lab, commands, handoff, habits.', inputSchema: { type: 'object', properties: { topic: { type: 'string' } } } },
];
const local = { hearth_help: (a) => ({ ok: true, value: MAP.topic(a.topic || 'app') || `Topics: ${Object.keys(MAP.TOPICS).join(', ')}.` }) };

module.exports = serve({ name: 'video-review', instructions: '', guide: '', tools: TOOLS, local }, module);
