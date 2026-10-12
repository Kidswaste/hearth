// MCP server that lets a chat agent talk back: ask the user a question (shown as a card in the chat,
// answered there) and get a second opinion from another agent (Astra) on a screenshot or an idea.
// The guide says when to use them, the descriptions how: nothing is said twice (both ride along with every message).
const { serve } = require('./common');

const GUIDE = `Talking with the user while you work, in the hub's chat. chat_ask only when a choice is really theirs (style, direction, missing info), not for small things you can decide. chat_progress only for work with several steps. chat_show + chat_ask to pick between variants. chat_second_opinion for visual work you're unsure about or when asked; weigh its advice yourself.`;

const TOOLS = [
  { name: 'chat_ask', description: 'Ask the user and wait for the answer (a card in the chat). options: 2–5 short choices as buttons (they can type unless free: false); multiple: true lets them pick several. Returns the answer or that they skipped.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, multiple: { type: 'boolean' }, free: { type: 'boolean' } }, required: ['question'] } },
  { name: 'chat_progress', description: 'Show / update your plan as a live checklist: send the whole list each time, steps [{ text, status: todo|doing|done }] (3–7 steps).',
    inputSchema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, required: ['text'] } } }, required: ['steps'] } },
  { name: 'chat_show', description: 'Put a picture in the chat with a caption (e.g. "Variant A: neon"); screenshot: true = what the user sees now (the Lab preview for the Three Director).',
    inputSchema: { type: 'object', properties: { caption: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['caption'] } },
  { name: 'chat_second_opinion', description: `Ask ${process.env.HUB_PARTNER || 'Astra'} (another AI, good with visuals) for a critique of what you are making; screenshot: true attaches what the user sees now.`,
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['question'] } },
  // (round 19, reach) you can open things for the user: no more "double-click it yourself"
  { name: 'chat_open', description: 'Open a file, page, folder or URL for the user on this computer: how default (its app / browser), browser, reveal (in Finder / Explorer) or preview (in Hearth). Paths from their other computer work.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, url: { type: 'string' }, how: { type: 'string', enum: ['default', 'browser', 'reveal', 'preview'] } } } },
  // (round 21, devreport) Hearth itself broke: a report the user reviews and sends (≈ 45 tokens; /report tool off drops it)
  ...(process.env.HUB_NO_REPORT === '1' ? [] : [{ name: 'chat_report_problem', description: 'Hearth itself misbehaved (an app bug, crash, broken hub tool; not your own code): draft a report to Hearth\'s developer. The user reviews it before anything is sent.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, details: { type: 'string', description: 'what failed, the error, what you tried' } }, required: ['title', 'details'] } }]),
];
// Astra without the chat tools gets chat_open alone (engines.js openTool → HUB_CHAT_ONLY)
const ONLY = (process.env.HUB_CHAT_ONLY || '').split(',').filter(Boolean);
const LIST = ONLY.length ? TOOLS.filter((t) => ONLY.includes(t.name)) : TOOLS;

// Every call carries the agent id, so the hub knows which chat is asking.
module.exports = serve({ name: 'chat', instructions: '', guide: GUIDE, tools: LIST, extraArgs: { agentId: process.env.HUB_AGENT_ID || '' } }, module);
