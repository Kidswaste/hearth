// MCP server for the owner's mood board (board.js): both engines (Claude and Astra) can read the board's vibe, look
// at one reference, add notes / links / colors and arrange it. Opt-in per agent (agent.boardTools: /board-tools on,
// or "directors"), so nobody pays for these tool definitions unless they use the board. The rule that matters is in
// every description and in the guide line: references give a VIBE; the media itself never goes into the output
// unless the owner explicitly asks for the clip.
const { serve, leanTools, dispatch } = require('./common');
const MAP = require('./hearth-map');

const RULE = 'References give a vibe (palette, light, texture, motion, pacing, mood); never place reference media in the output unless the owner explicitly asks for the clip itself.';
const TOOLS = [
  { name: 'board_list', description: 'The owner\'s mood boards (id, name, refs; which is linked to this chat).', inputSchema: { type: 'object', properties: {} } },
  { name: 'board_vibe', description: `Vibe of a board (this chat's linked board by default), a frame or one item: palette, light, color, texture, motion and cut pacing, composition, type, mood, the owner's notes. items: true lists item ids; image: true adds a small preview of the item. ${RULE}`,
    inputSchema: { type: 'object', properties: { board: { type: 'string' }, item: { type: 'string' }, frame: { type: 'string' }, focus: { type: 'string', enum: ['full', 'palette', 'light', 'color', 'motion', 'texture', 'composition', 'type', 'mood', 'notes'] }, items: { type: 'boolean' }, query: { type: 'string' }, image: { type: 'boolean' } } } },
  { name: 'board_add', description: 'Add to the board (frame: inside that frame): kind note|text|url|file|colors|frame (url = a website card or a picture / clip link; colors = hex list). A found picture: source (its page) + credit (author / site).', inputSchema: { type: 'object', properties: { board: { type: 'string' }, frame: { type: 'string' }, kind: { type: 'string', enum: ['note', 'text', 'url', 'file', 'colors', 'frame'] }, text: { type: 'string' }, url: { type: 'string' }, path: { type: 'string' }, colors: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, note: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, source: { type: 'string' }, credit: { type: 'string' } } } },
  { name: 'board_arrange', description: 'Auto-arrange a board (or a frame / item ids): grid, masonry, row, timeline, collage, by-hue, by-light, by-motion, cols-type, cols-mood, pack, tidy…', inputSchema: { type: 'object', properties: { board: { type: 'string' }, layout: { type: 'string' }, frame: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['layout'] } },
  { name: 'board_do', description: 'More on a board: op collections | collection {name, query} (a live saved search) | show {name} | groups {k?} (frames of alike refs) | lab-look {name?} | timeline (clips\' shots and pace) | find {query} (items by description) | caption {item, text} (one line on what you saw, kept for later reads) | pinterest {phrases?, aesthetic?} (Pinterest searches shown to the owner as buttons) | pins {query?} (images like the vibe from Pinterest; the owner picks).',
    inputSchema: { type: 'object', properties: { op: { type: 'string', enum: ['collections', 'collection', 'show', 'groups', 'lab-look', 'timeline', 'find', 'caption', 'pinterest', 'pins'] }, name: { type: 'string' }, query: { type: 'string' }, k: { type: 'integer' }, item: { type: 'string' }, text: { type: 'string' }, phrases: { type: 'array', items: { type: 'string' } }, aesthetic: { type: 'string' } }, required: ['op'] } },
  // (round 14) eyes: real pictures, small by default; ask for medium / large only when detail matters
  { name: 'board_look', description: 'SEE the board: item (region [x,y,w,h] 0..1 = close-up), items (compare: true = side by side + vibe differences), selection, frame, or nothing = the whole board with item ids. size small (default) | medium | large.',
    inputSchema: { type: 'object', properties: { board: { type: 'string' }, item: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, compare: { type: 'boolean' }, frame: { type: 'string' }, selection: { type: 'boolean' }, size: { type: 'string', enum: ['small', 'medium', 'large'] }, region: { type: 'array', items: { type: 'number' } } } } },
  { name: 'board_watch', description: 'Watch a clip / gif: count frames (6) evenly, at times [s], or mode scenes (one per shot); one timestamped sheet, or as: frames. size like board_look.',
    inputSchema: { type: 'object', properties: { board: { type: 'string' }, item: { type: 'string' }, count: { type: 'integer' }, times: { type: 'array', items: { type: 'number' } }, mode: { type: 'string', enum: ['even', 'scenes'] }, as: { type: 'string', enum: ['sheet', 'frames'] }, from: { type: 'number' }, to: { type: 'number' }, size: { type: 'string' } }, required: ['item'] } },
];
const local = {};
// one line in the system prompt of agents that have the board tools (engines.js buildPrompt)
const guide = `MOOD BOARD (board_* tools): the owner's references. ${RULE} Read board_vibe before styling something "like my board"; board_look (a clip: board_do watch) when you need to see them; name items by id.`;

// (round 31, tokensaver) what rides along with every message: short words; the whole descriptions above (and the
// long enums) come back from board_do { help: '<tool or op>' }, answered here without the hub (common.js leanTools).
// (round 41, toolslim) four tools listed: board_list / board_arrange / board_watch are board_do ops (reached under
// their own names, so the hub is unchanged); rarely used args are named in the words, not the schema.
const SHORT = {
  board_vibe: ['Vibe of a board (default: this chat\'s), frame or item; focus: palette|light|motion|mood…; items: true lists ids; image: true adds a preview. A vibe only: never place reference media in the output unless the owner asks for the clip itself.', ['board', 'item', 'frame', 'focus', 'items', 'image']],
  board_add: ['Add to a board (frame: inside it): kind note|text|url|file|colors|frame, with text / url / path / colors [hex] / title / note / tags. A found picture: source + credit.', ['board', 'kind', 'text', 'url', 'path']],
  board_do: ['More: op list (the boards) | arrange {layout: grid|masonry|timeline|by-hue|by-mood|tidy…, frame?, items?} | watch {item, count|times|mode: scenes, as: frames} (see a clip / gif) | collections | collection | show | groups | lab-look | timeline | find | caption | pinterest | pins. help: a tool or op.', ['op', 'board', 'item']],
  board_look: ['SEE the board: item (+ region [x,y,w,h] close-up), items (+ compare: true), selection, frame, or nothing = all with ids. size small|medium|large.', ['board', 'item', 'items', 'compare', 'selection', 'frame', 'size', 'region']],
};
const MERGED = ['board_list', 'board_arrange', 'board_watch'];
const L = leanTools(TOOLS, SHORT, 'board_do', { board_do: MERGED });
// board_do's ops, one line each, for help <op>
L.help.board_do += '\nops: list | arrange {layout, frame?, items?} | watch {item, count, times, mode, as, from, to, size} | collections | collection {name, query} | show {name} | groups {k?} | lab-look {name?} | timeline | find {query} | caption {item, text} | pinterest {phrases?, aesthetic?} | pins {query?}';
local.board_do = dispatch(Object.fromEntries(MERGED.map((n) => [n.replace(/^board_/, ''), n])));

module.exports = serve({ name: 'board', instructions: '', guide, tools: L.list, help: L.help, local, RULE, all: TOOLS }, module);
// keep the map reachable for tests
void MAP;
