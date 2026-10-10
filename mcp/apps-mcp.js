// MCP server for the owner's apps (apps.js): both engines (Claude and Astra) can open an app window, type a prompt
// into one (Suno's boxes: the owner presses its own Create), and ask Meshy for a 3D model. Every Meshy generation
// costs the owner credits, so Hearth shows the cost and asks the owner first, every time; the API key never leaves
// the main process. Opt-in per agent (/apps-tools on, or directors): nobody pays for these definitions unless used.
const { serve } = require('./common');

const TOOLS = [
  { name: 'apps_open', description: 'The owner\'s app windows (Meshy, Suno, Figma, Spline, Sketchfab, Poly Haven, Coolors, Runway, ElevenLabs, YouTube Studio…). No app: list them. app + url: open there. paste (+ field: style|lyrics|title|prompt): type text into its page (e.g. a Suno prompt; the owner presses Create). action: one of its actions (e.g. coolors palette, suno use).',
    inputSchema: { type: 'object', properties: { app: { type: 'string' }, url: { type: 'string' }, paste: { type: 'string' }, field: { type: 'string' }, action: { type: 'string' } } } },
  { name: 'meshy_generate', description: 'Ask Meshy for a 3D model (costs the owner credits: Hearth shows the cost and the owner approves or declines). prompt: what to make; draft: shape only (cheaper); image: a picture path or "board" (the selected / newest board picture); model + texture: retexture a library model ("last" or #n); model + polycount: remesh. to: lab (a model layer) | board. Returns at once; takes minutes.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, draft: { type: 'boolean' }, image: { type: 'string' }, model: { type: 'string' }, texture: { type: 'string' }, polycount: { type: 'integer' }, art: { type: 'string', enum: ['realistic', 'sculpture'] }, name: { type: 'string' }, to: { type: 'string', enum: ['lab', 'board', 'library'] } } } },
  { name: 'meshy_status', description: 'Meshy: running jobs, the owner\'s model library (#n names), the key state.', inputSchema: { type: 'object', properties: {} } },
];
const local = {};
const guide = 'APPS (apps_*, meshy_*): the owner\'s app windows. Meshy generations cost the owner credits: ask for one only when a 3D model is really needed; the owner confirms each.';

module.exports = serve({ name: 'apps', instructions: '', guide, tools: TOOLS, local }, module);
