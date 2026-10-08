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
  { name: 'chat_second_opinion', description: 'Ask Astra (another AI, good with visuals) for a critique of what you are making; screenshot: true attaches what the user sees now.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['question'] } },
];

// Every call carries the agent id, so the hub knows which chat is asking.
module.exports = serve({ name: 'chat', instructions: '', guide: GUIDE, tools: TOOLS, extraArgs: { agentId: process.env.HUB_AGENT_ID || '' } }, module);
