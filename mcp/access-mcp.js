// MCP server behind Claude Code's `--permission-prompt-tool mcp__access__access_permission` (round 14, chat file
// access). Claude Code calls it whenever a tool call needs permission (an edit, a command, a read outside the chat's
// folders); Hearth decides in the window (access.js: the classifier, the chat's grants, the approval card, backups for
// Undo, deletes to the Trash) and this answers in the shape the CLI expects, as JSON text:
//   { "behavior": "allow", "updatedInput": { … } }  or  { "behavior": "deny", "message": "…" }
// Anything that goes wrong (Hearth closed, no answer) denies. The model never needs to call it itself.
const { serve, callHub } = require('./common');

const TOOLS = [
  // (round 41, toolslim) listed to the model too (Claude Code can't hide a permission tool): a few words only
  { name: 'access_permission', description: 'Hearth\'s own check; never call it.',
    inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name'] } },
];

const deny = (message) => ({ ok: true, value: JSON.stringify({ behavior: 'deny', message }) });

async function permission(args) {
  const { tool_name: tool, input = {}, tool_use_id: id } = args || {};
  // the chat this run answers and where the engine runs (engines.js sets both): the hub routes the card by them
  const r = await callHub('access_check', { tool, input, id, agentId: process.env.HUB_AGENT_ID || '', chatId: process.env.HUB_ACCESS_CHAT || '', cwd: process.env.HUB_ACCESS_CWD || '' });
  if (!r || !r.ok) return deny(`Hearth couldn't check this (${(r && r.error) || 'no answer'}), so it was not allowed.`);
  const v = r.value || {};
  if (v.behavior === 'allow') return { ok: true, value: JSON.stringify({ behavior: 'allow', updatedInput: v.updatedInput || input }) };
  return deny(String(v.message || 'The user did not allow this.'));
}

module.exports = serve({ name: 'access', instructions: '', tools: TOOLS, local: { access_permission: permission } }, module);
module.exports.permission = permission;
