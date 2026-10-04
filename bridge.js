// Routes tool calls from Claude (MCP servers → gamebridge.js → here) to the screen that owns them,
// by tool-name prefix: forge_ → live game, video_/ae_ → Video Review, three_ → Three.js Lab.
const HubBridge = (() => {
  const handlers = [];
  window.hub.onGameCall(async ({ id, tool, args }) => {
    const h = handlers.find((x) => tool.startsWith(x.prefix));
    let result;
    try { result = h ? await h.fn(tool, args || {}) : { ok: false, error: `Nothing in the hub handles ${tool}.` }; } catch (err) { result = { ok: false, error: err.message }; }
    window.hub.gameResult(id, result);
  });
  return { register(prefixes, fn) { for (const prefix of prefixes) handlers.push({ prefix, fn }); } };
})();
