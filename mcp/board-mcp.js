// MCP server for the owner's mood board (board.js): both engines (Claude and Astra) can read the board's vibe, look
// at one reference, add notes / links / colors and arrange it. Opt-in per agent (agent.boardTools: /board-tools on,
// or "directors"), so nobody pays for these tool definitions unless they use the board. The rule that matters is in
// every description and in the guide line: references give a VIBE; the media itself never goes into the output
// unless the owner explicitly asks for the clip.
const { serve } = require('./common');
const MAP = require('./hearth-map');

const RULE = 'References give a vibe (palette, light, texture, motion, pacing, mood); never place reference media in the output unless the owner explicitly asks for the clip itself.';
const TOOLS = [
  { name: 'board_list', description: 'The owner\'s mood boards (id, name, refs; which is linked to this chat).', inputSchema: { type: 'object', properties: {} } },
  { name: 'board_vibe', description: `Vibe of a board (this chat's linked board by default), a frame or one item: palette, light, color, texture, motion and cut pacing, composition, type, mood, the owner's notes. items: true lists item ids; image: true adds a small preview of the item. ${RULE}`,
    inputSchema: { type: 'object', properties: { board: { type: 'string' }, item: { type: 'string' }, frame: { type: 'string' }, focus: { type: 'string', enum: ['full', 'palette', 'light', 'color', 'motion', 'texture', 'composition', 'type', 'mood', 'notes'] }, items: { type: 'boolean' }, query: { type: 'string' }, image: { type: 'boolean' } } } },
  { name: 'board_add', description: 'Add to the board (frame: inside that frame): kind note|text|url|file|colors|frame (url = a website card or a picture / clip link; colors = hex list).', inputSchema: { type: 'object', properties: { board: { type: 'string' }, frame: { type: 'string' }, kind: { type: 'string', enum: ['note', 'text', 'url', 'file', 'colors', 'frame'] }, text: { type: 'string' }, url: { type: 'string' }, path: { type: 'string' }, colors: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, note: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } },
  { name: 'board_arrange', description: 'Auto-arrange a board (or a frame / item ids): grid, masonry, row, timeline, collage, by-hue, by-light, by-motion, cols-type, cols-mood, pack, tidy…', inputSchema: { type: 'object', properties: { board: { type: 'string' }, layout: { type: 'string' }, frame: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['layout'] } },
];
const local = {};
// one line in the system prompt of agents that have the board tools (engines.js buildPrompt)
const guide = `MOOD BOARD (board_* tools): the owner's references. ${RULE} Read board_vibe before styling something "like my board".`;

module.exports = serve({ name: 'board', instructions: '', guide, tools: TOOLS, local, RULE }, module);
// keep the map reachable for tests
void MAP;
