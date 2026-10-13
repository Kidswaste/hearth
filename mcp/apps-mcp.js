// MCP server for the owner's apps (apps.js): both engines (Claude and Astra) can open an app window, type a prompt
// into one (Suno's boxes: the owner presses its own Create), and ask Meshy for a 3D model. Every Meshy generation
// costs the owner credits, so Hearth shows the cost and asks the owner first, every time; the API key never leaves
// the main process. Opt-in per agent (/apps-tools on, or directors): nobody pays for these definitions unless used.
const { serve, leanTools } = require('./common');

const TOOLS = [
  { name: 'apps_open', description: 'The owner\'s app windows (Meshy, Suno, Figma, Spline, Sketchfab, Poly Haven, Coolors, Runway, ElevenLabs, YouTube Studio…). No app: list them. app + url: open there. paste (+ field: style|lyrics|title|prompt): type text into its page (e.g. a Suno prompt; the owner presses Create). action: one of its actions (e.g. coolors palette, suno use). suggest: true (+ why): a card offering the app to the owner. send: board|lab|render|<path>: put it on the clipboard and open the app to paste. op: discover (apps the owner hasn\'t tried that fit now).',
    inputSchema: { type: 'object', properties: { app: { type: 'string' }, url: { type: 'string' }, paste: { type: 'string' }, field: { type: 'string' }, action: { type: 'string' }, suggest: { type: 'boolean' }, why: { type: 'string' }, send: { type: 'string' }, op: { type: 'string', enum: ['list', 'discover'] } } } },
  { name: 'meshy_generate', description: 'Ask Meshy for a 3D model (costs the owner credits: Hearth shows the cost and the owner approves or declines). prompt: what to make; draft: shape only (cheaper); image: a picture path or "board" (the selected / newest board picture); model + texture: retexture a library model ("last" or #n); model + polycount: remesh. to: lab (a model layer) | board. Returns at once; takes minutes.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, draft: { type: 'boolean' }, image: { type: 'string' }, model: { type: 'string' }, texture: { type: 'string' }, polycount: { type: 'integer' }, art: { type: 'string', enum: ['realistic', 'sculpture'] }, name: { type: 'string' }, to: { type: 'string', enum: ['lab', 'board', 'library'] } } } },
  { name: 'apps_page', description: 'An open app\'s page (in Hearth\'s window or in Chrome): do: text (+ selector) | click selector | type selector text (+ enter) | key | shot (a picture) | wait (selector or load) | go url | info.',
    inputSchema: { type: 'object', properties: { app: { type: 'string' }, do: { type: 'string', enum: ['text', 'click', 'type', 'key', 'shot', 'wait', 'go', 'info'] }, selector: { type: 'string' }, text: { type: 'string' }, enter: { type: 'boolean' }, key: { type: 'string' }, url: { type: 'string' } }, required: ['app'] } },
  { name: 'meshy_status', description: 'Meshy: running jobs, the owner\'s model library (#n names), the key state.', inputSchema: { type: 'object', properties: {} } },
];
const local = {};
const guide = 'APPS (apps_*, meshy_*): the owner\'s app windows. Meshy generations cost the owner credits: ask for one only when a 3D model is really needed; the owner confirms each.';

// (round 31, tokensaver) short words in the list; the whole descriptions come from apps_open { help: '<tool>' }
const SHORT = {
  apps_open: 'The owner\'s app windows (Meshy, Suno, Figma, Spline, Coolors, Runway…). No app: list them. app + url | paste (+ field) | action | suggest (+ why) | send: board|lab|render|<path> | op: discover. help: a tool → its details.',
  meshy_generate: 'A 3D model from Meshy (costs credits: the owner approves each). prompt or image (path | "board"); draft: shape only; model + texture | polycount: retexture / remesh; to: lab|board|library. Returns at once; takes minutes.',
  apps_page: 'An open app\'s page: do text | click | type (+ enter) | key | shot | wait | go | info, with selector / text / url.',
};
const L = leanTools(TOOLS, SHORT, 'apps_open');

module.exports = serve({ name: 'apps', instructions: '', guide, tools: L.list, help: L.help, local }, module);
