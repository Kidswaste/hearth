// MCP server for the Video Director: lets Claude look at renders in the hub's Video Review,
// annotate them, re-render with aerender and run After Effects scripts.
const { serve } = require('./common');

const GUIDE = `You work with the hub's Video Review screen, which the user is looking at next to this chat.
The user does not edit in After Effects themselves: scripts (ExtendScript .jsx, Python, Node…) build and render the videos.
Look at renders with video_contact_sheet (whole video at a glance) and video_frame (one exact moment), then talk about what you see in visual terms.
Notes added with video_add_note appear on the user's timeline. Times are in seconds.`;

const TOOLS = [
  { name: 'video_list', description: 'Recent video renders the hub found (newest first): path, name, size, modified time.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', default: 20 }, search: { type: 'string', description: 'Filter by text in the path' } } } },
  { name: 'video_status', description: 'What is open in Video Review: file, resolution, duration, playhead time, paused, and the timecoded notes the user wrote on it.', inputSchema: { type: 'object', properties: {} } },
  { name: 'video_open', description: 'Open a video in Video Review (the user sees it).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'video_frame', description: 'Get one frame of the open video as an image. Optionally jump to a time first (the user\'s playhead moves there too).', inputSchema: { type: 'object', properties: { time: { type: 'number', description: 'Seconds' } } } },
  { name: 'video_contact_sheet', description: 'One image with evenly spaced frames from the whole open video (or a time range), each labelled with its time. Best way to review a render quickly.', inputSchema: { type: 'object', properties: { count: { type: 'integer', default: 12, minimum: 4, maximum: 24 }, from: { type: 'number' }, to: { type: 'number' } } } },
  { name: 'video_add_note', description: 'Pin a note on the user\'s timeline at a time (seconds).', inputSchema: { type: 'object', properties: { time: { type: 'number' }, text: { type: 'string' } }, required: ['time', 'text'] } },
  { name: 'video_compare', description: 'Show an A/B wipe between the open video (A) and another file (B).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'ae_render', description: 'Render an After Effects project with aerender (in the background; After Effects stays usable). Waits until it finishes and returns the result and log tail. The new file then appears in Video Review.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Path to the .aep' }, comp: { type: 'string', description: 'Composition name (omit to use the project\'s render queue)' }, output: { type: 'string', description: 'Output file path (optional)' }, omTemplate: { type: 'string', description: 'Output module template name (optional)' } }, required: ['project'] } },
  { name: 'ae_run_script', description: 'Run ExtendScript inside After Effects (starts AE if needed) as one undoable step. Use for changes inside an AE project; errors show as an alert in AE.', inputSchema: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } }, required: ['code'] } },
];

serve({ name: 'video-review', instructions: GUIDE, tools: TOOLS });
