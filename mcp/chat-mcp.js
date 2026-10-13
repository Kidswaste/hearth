// MCP server that lets a chat agent talk back: ask the user a question (shown as a card in the chat,
// answered there) and get a second opinion from another agent (Astra) on a screenshot or an idea.
// The guide says when to use them, the descriptions how: nothing is said twice (both ride along with every message).
const { serve, callHub } = require('./common');

const GUIDE = `CHAT TOOLS: chat_ask only when a choice is really the user's (style, direction, missing info), not small things you can decide; chat_progress only for work with several steps; chat_show + chat_ask to pick between variants; chat_second_opinion for visual work you're unsure about or when asked (weigh its advice yourself).`;

const TOOLS = [
  { name: 'chat_ask', description: 'Ask the user and wait (a card in the chat). options: 2–5 short choices as buttons (free: false = no typing; multiple: true = several). Returns the answer, or that they skipped.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, multiple: { type: 'boolean' }, free: { type: 'boolean' } }, required: ['question'] } },
  { name: 'chat_progress', description: 'Your plan as a live checklist: the whole list each time, steps [{text, status}] (3–7).',
    inputSchema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, required: ['text'] } } }, required: ['steps'] } },
  { name: 'chat_show', description: 'A picture in the chat with a caption ("Variant A: neon"); screenshot: true = what the user sees now (a director: the Lab preview).',
    inputSchema: { type: 'object', properties: { caption: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['caption'] } },
  { name: 'chat_second_opinion', description: `${process.env.HUB_PARTNER || 'Astra'} (another AI, good with visuals) critiques what you're making; screenshot: true attaches what the user sees.`,
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
// ≈ 250 tokens less on every message of every plain Claude chat. Directors keep the whole list (they use them a lot).
const LEAN = process.env.HUB_CHAT_LEAN === '1';
const REST = TOOLS.filter((t) => !['chat_ask', 'chat_open'].includes(t.name));
const opOf = (name) => name.replace(/^chat_/, '');
const HELP = Object.fromEntries(TOOLS.map((t) => [t.name, `${t.name}${LEAN && REST.includes(t) ? ` (chat_do op "${opOf(t.name)}")` : ''}: ${t.description}\nargs: ${Object.keys(t.inputSchema.properties).join(', ')}`]));
const CHAT_DO = { name: 'chat_do', description: `op progress {steps: [{text, status: todo|doing|done}]} (your plan, live) | show {caption, screenshot} (a picture in the chat) | second_opinion {question, screenshot} (${process.env.HUB_PARTNER || 'Astra'}'s critique)${REST.some((t) => t.name === 'chat_report_problem') ? ' | report_problem {title, details} (Hearth itself broke)' : ''}. help: an op.`,
  inputSchema: { type: 'object', properties: { op: { type: 'string' }, help: { type: 'string' } } } };
const LIST = ONLY.length ? TOOLS.filter((t) => ONLY.includes(t.name)) : LEAN ? [...TOOLS.filter((t) => !REST.includes(t)), CHAT_DO] : TOOLS;
const local = {
  chat_do: (a) => {
    const { op, ...rest } = a;
    const t = REST.find((x) => opOf(x.name) === String(op || '').replace(/^chat_/, ''));
    return t ? callHub(t.name, rest) : { ok: false, error: `op: ${REST.map((x) => opOf(x.name)).join(' | ')}` };
  },
};

// Every call carries the agent id, so the hub knows which chat is asking.
module.exports = serve({ name: 'chat', instructions: '', guide: GUIDE, tools: LIST, local, help: HELP, extraArgs: { agentId: process.env.HUB_AGENT_ID || '' } }, module);
