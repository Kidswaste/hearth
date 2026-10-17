// MCP server that lets a chat agent talk back: ask the user a question (shown as a card in the chat,
// answered there) and get a second opinion from another agent (Astra) on a screenshot or an idea.
// The guide says when to use them, the descriptions how: nothing is said twice (both ride along with every message).
const { serve, callHub } = require('./common');

// (round 41, toolslim) chat_show / chat_second_opinion / chat_open are reached through chat_do for directors too
// (≈ 230 tokens less on every director step); the guide names them that way.
// (round 46, promptdiet) the same four rules in fewer words
const GUIDE = `CHAT TOOLS: chat_ask only for choices that are really the user's (style, direction, missing info), not small ones; chat_progress only for work with several steps; chat_do show + chat_ask to pick between variants; chat_do second_opinion when unsure about visual work or asked (weigh it yourself).`;

const PARTNER = process.env.HUB_PARTNER || 'Astra';
// The whole descriptions (help <tool or op> answers with them, locally); the list sends the SHORT words below.
const TOOLS = [
  { name: 'chat_ask', description: 'Ask the user and wait (a card in the chat). options: 2–5 short choices as buttons (free: false = no typing; multiple: true = several). Returns the answer, or that they skipped.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, multiple: { type: 'boolean' }, free: { type: 'boolean' } }, required: ['question'] } },
  { name: 'chat_progress', description: 'Your plan as a live checklist: the whole list each time, steps [{text, status}] (3–7).',
    inputSchema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, required: ['text'] } } }, required: ['steps'] } },
  { name: 'chat_show', description: 'A picture in the chat with a caption ("Variant A: neon"); screenshot: true = what the user sees now (a director: the Lab preview).',
    inputSchema: { type: 'object', properties: { caption: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['caption'] } },
  { name: 'chat_second_opinion', description: `${PARTNER} (another AI, good with visuals) critiques what you're making; screenshot: true attaches what the user sees.`,
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['question'] } },
  // (round 19, reach) you can open things for the user: no more "double-click it yourself"
  { name: 'chat_open', description: 'Open a file, folder, page or URL for the user: how default (its app) | browser | reveal (Finder / Explorer) | preview (in Hearth). Paths from their other computer work.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, url: { type: 'string' }, how: { type: 'string', enum: ['default', 'browser', 'reveal', 'preview'] } } } },
  // (round 21, devreport) Hearth itself broke: a report the user reviews and sends (≈ 45 tokens; /report tool off drops it)
  ...(process.env.HUB_NO_REPORT === '1' ? [] : [{ name: 'chat_report_problem', description: 'Hearth itself misbehaved (app bug, crash, broken hub tool; not your own code): draft a report to its developer; the user reviews it first.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, details: { type: 'string', description: 'what failed, the error, what you tried' } }, required: ['title', 'details'] } }]),
];
// Astra without the chat tools gets chat_open alone (engines.js openTool → HUB_CHAT_ONLY)
const ONLY = (process.env.HUB_CHAT_ONLY || '').split(',').filter(Boolean);
// (round 31, tokensaver) a plain chat (no director guide: engines.js sets HUB_CHAT_LEAN) gets chat_ask + chat_open +
// one chat_do for the rest (plan checklist, picture, second opinion, problem report): each call still reaches the hub
// under its own name (native.js handles chat_progress, chat_show… as before); the details come from help.
// ≈ 250 tokens less on every message of every plain Claude chat.
// (round 41, toolslim) directors keep chat_ask + chat_progress (their everyday two), plain chats chat_ask, and both reach
// the rest through chat_do (chat_open too: chat_do open); old names keep working when called (the hub routes by name),
// they're just not listed. Astra's lone chat_open (HUB_CHAT_ONLY) stays its own tool.
const LEAN = process.env.HUB_CHAT_LEAN === '1';
const KEEP = LEAN ? ['chat_ask'] : ['chat_ask', 'chat_progress'];
const REST = TOOLS.filter((t) => !KEEP.includes(t.name));
const opOf = (name) => name.replace(/^chat_/, '');
const HELP = Object.fromEntries(TOOLS.map((t) => [t.name, `${t.name}${REST.includes(t) ? ` (chat_do op "${opOf(t.name)}")` : ''}: ${t.description}\nargs: ${Object.keys(t.inputSchema.properties).join(', ')}`]));
const OPS = {
  chat_progress: 'progress {steps: [{text, status: todo|doing|done}]} (your plan, live)',
  chat_show: 'show {caption} (a picture of the screen in the chat)',
  chat_second_opinion: `second_opinion {question, screenshot} (${PARTNER}'s critique)`,
  chat_open: 'open {path|url, how: default|browser|reveal|preview} (a file, folder or page, for the user)',
  chat_report_problem: 'report_problem {title, details} (Hearth itself broke)',
};
const CHAT_DO = { name: 'chat_do', description: `op ${REST.map((t) => OPS[t.name]).join(' | ')}. help: an op.`,
  inputSchema: { type: 'object', properties: { op: { type: 'string' }, help: { type: 'string' } } } };
// (round 41, toolslim) the listed tools in fewer words (same args; the whole words are in help)
const SHORT = {
  chat_ask: 'Ask the user and wait (a card). options: 2–5 button choices (multiple: several; free: false = no typing).',
  chat_progress: 'Your plan as a live checklist: steps [{text, status: todo|doing|done}], all of them each time (3–7).',
  chat_open: 'Open a file, folder or URL for the user (their other computer\'s paths work). how: reveal = in Finder/Explorer, preview = in Hearth.',
};
// a step's object schema is said once in the words above (native.js reads text / status, strings work too)
// (round 46, promptdiet) chat_ask's multiple / free are named in its words, not its schema (the hub reads them either way)
const SCHEMA = { chat_progress: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object' } } }, required: ['steps'] }, chat_ask: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] } };
const slim = (t) => (SHORT[t.name] ? { ...t, description: SHORT[t.name], inputSchema: SCHEMA[t.name] || t.inputSchema } : t);
const LIST = ONLY.length ? TOOLS.filter((t) => ONLY.includes(t.name)).map(slim) : [...TOOLS.filter((t) => KEEP.includes(t.name)).map(slim), CHAT_DO];
const local = {
  chat_do: (a) => {
    const { op, ...rest } = a;
    // (round 42, handoff) the earlier messages a handoff brief stands in for (named in the brief, not in the tool list)
    if (String(op || '').replace(/^chat_/, '') === 'earlier') return callHub('chat_earlier', rest);
    if (String(op || '').replace(/^chat_/, '') === 'sound') return callHub('chat_sound', rest);
    const t = REST.find((x) => opOf(x.name) === String(op || '').replace(/^chat_/, ''));
    return t ? callHub(t.name, rest) : { ok: false, error: `op: ${REST.map((x) => opOf(x.name)).join(' | ')}` };
  },
};

// Every call carries the agent id, so the hub knows which chat is asking.
module.exports = serve({ name: 'chat', instructions: '', guide: GUIDE, tools: LIST, local, help: HELP, extraArgs: { agentId: process.env.HUB_AGENT_ID || '' } }, module);
