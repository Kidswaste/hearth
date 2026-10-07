// MCP server that lets a chat agent talk back: ask the user a question (shown as a card in the chat,
// answered there) and get a second opinion from another agent (Astra) on a screenshot or an idea.
const { serve } = require('./common');

const GUIDE = `Tools for talking with the user while you work, inside the hub's chat.
- chat_ask: ask the user a question and wait for the answer (a card with your options appears in the chat; they click one or type). Use it when a choice is genuinely theirs (style, direction, which of two approaches, missing info you can't infer) instead of guessing on something big. Give 2–5 short options when there are clear choices. Don't ask about small things you can decide yourself, and don't ask more than you need.
- chat_second_opinion: ask Astra (a different AI, good with visuals) for a critique. With screenshot: true it sees what's on the user's screen (the Three.js Lab preview when you work there). Use it for visual work when you're unsure it looks right, or when the user asks for a second opinion; then weigh its advice yourself.`;

const TOOLS = [
  { name: 'chat_ask', description: 'Ask the user a question in the chat and wait for their answer. options: short choices shown as buttons (they can also type their own answer unless free is false); multiple: true lets them pick several. Returns their answer (or that they skipped).',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, multiple: { type: 'boolean' }, free: { type: 'boolean', description: 'Allow a typed answer (default true)' } }, required: ['question'] } },
  { name: 'chat_second_opinion', description: 'Get a second opinion from Astra (another AI) and return its answer. Describe what you are making and what you want judged. screenshot: true attaches a picture of what the user sees now (the Lab preview when you are the Three Director, otherwise the hub window).',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['question'] } },
];

// Every call carries the agent id, so the hub knows which chat is asking.
serve({ name: 'chat', instructions: GUIDE, tools: TOOLS, extraArgs: { agentId: process.env.HUB_AGENT_ID || '' } });
