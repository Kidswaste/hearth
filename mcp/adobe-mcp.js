// MCP server for the owner's Adobe apps (adobe.js / adobe-cmds.js through the hub): Photoshop, Illustrator,
// Premiere Pro, Media Encoder, InDesign, After Effects. Opt-in per agent (/adobe-tools on), since its tool list rides
// along with every message. Running the agent's own ExtendScript (action "script") asks the owner first.
const { serve } = require('./common');

// (round 41, toolslim) each app's actions come from adobe_do { help: '<app>' }, answered here (no hub): the list keeps
// one short line instead of all of them (≈ 300 → ≈ 130 tokens on every message of an AI with the Adobe tools).
const ACTIONS = {
  photoshop: 'photoshop: open {path|"lab" = Lab still} · board {selected} (layered PSD) · actions · action {set, name, path?} · sizes {sizes: "9:16 4:5" | "socials" | "1080x1920"} · place {path} · back {to: chat|board|lab} (front doc → PNG, you see it)',
  illustrator: 'illustrator: svg {path?} (→ SVG, added to the open Lab sketch) · png · open · place',
  premiere: 'premiere: timeline (the Lab sequence as FCP XML; its scenes render first) · import {path|"last", name?} · xml · info',
  mediaencoder: 'mediaencoder: queue {path|"last", preset?} · presets',
  indesign: 'indesign: pdf {path?} · place · open',
  aftereffects: 'aftereffects: import {path}',
  script: 'any app: script {code} (ExtendScript function body returning a value; asks the owner) · status (app omitted).',
};
const FULL = `The owner's Adobe apps (Mac/Windows; a missing app answers why). app + action:\n${Object.values(ACTIONS).join('\n')}`;
const TOOLS = [
  { name: 'adobe_do', description: 'The owner\'s Adobe apps (a missing app says why): app + action (help: an app → its actions; e.g. photoshop open|board|sizes|back, illustrator svg, premiere timeline|import, mediaencoder queue), with path / name / to / sizes / preset as it needs; action script {code} = your ExtendScript (asks the owner); no app = status.',
    inputSchema: { type: 'object', properties: { app: { type: 'string', enum: ['photoshop', 'illustrator', 'premiere', 'mediaencoder', 'indesign', 'aftereffects', 'status'] }, action: { type: 'string' }, path: { type: 'string' }, help: { type: 'string' } } } },
];
const HELP = { adobe_do: `adobe_do: ${FULL}\nargs: app, action, path, set, name, sizes, to, preset, selected, code`, ...ACTIONS };
const guide = 'ADOBE (adobe_do): send Hearth\'s pictures, boards and edits to the owner\'s Adobe apps and bring results back.';

module.exports = serve({ name: 'adobe', instructions: '', guide, tools: TOOLS, help: HELP, local: {} }, module);
