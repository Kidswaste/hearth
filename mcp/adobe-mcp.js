// MCP server for the owner's Adobe apps (adobe.js / adobe-cmds.js through the hub): Photoshop, Illustrator,
// Premiere Pro, Media Encoder, InDesign, After Effects. Opt-in per agent (/adobe-tools on), since its tool list rides
// along with every message. Running the agent's own ExtendScript (action "script") asks the owner first.
const { serve } = require('./common');

const TOOLS = [
  { name: 'adobe_do', description: 'The owner\'s Adobe apps (Mac/Windows; a missing app answers why). app + action:\n'
    + 'photoshop: open {path|"lab" = Lab still} · board {selected} (layered PSD) · actions · action {set, name, path?} · sizes {sizes: "9:16 4:5" | "socials" | "1080x1920"} · place {path} · back {to: chat|board|lab} (front doc → PNG, you see it)\n'
    + 'illustrator: svg {path?} (→ SVG, added to the open Lab sketch) · png · open · place\n'
    + 'premiere: timeline (the Lab sequence as FCP XML; its scenes render first) · import {path|"last", name?} · xml · info\n'
    + 'mediaencoder: queue {path|"last", preset?} · presets\n'
    + 'indesign: pdf {path?} · place · open · aftereffects: import {path}\n'
    + 'any app: script {code} (ExtendScript function body returning a value; asks the owner) · status (app omitted).',
  inputSchema: { type: 'object', properties: { app: { type: 'string', enum: ['photoshop', 'illustrator', 'premiere', 'mediaencoder', 'indesign', 'aftereffects', 'status'] }, action: { type: 'string' }, path: { type: 'string' }, set: { type: 'string' }, name: { type: 'string' }, sizes: { type: 'string' }, to: { type: 'string' }, preset: { type: 'string' }, selected: { type: 'boolean' }, code: { type: 'string' } } } },
];
const guide = 'ADOBE (adobe_do): send Hearth\'s pictures, boards and edits to the owner\'s Adobe apps and bring results back.';

module.exports = serve({ name: 'adobe', instructions: '', guide, tools: TOOLS, local: {} }, module);
