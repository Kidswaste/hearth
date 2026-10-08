// Routes tool calls from the agents (MCP servers → gamebridge.js → here) to the screen that owns them, by
// tool-name prefix: forge_ → live game, video_/ae_ → Video Review, three_ → Three.js Lab, chat_ → the chat.
// It also keeps a short log of every call (tool, a one-line summary of the arguments, time, outcome, the latest
// picture) that the docked director's activity strip and /director commands show. Nothing here reaches the model.
const HubBridge = (() => {
  const handlers = [];
  const listeners = new Set();
  const log = []; // newest last: { id, tool, cmd, summary, at, ms, ok, error, image, running }
  const LOG_MAX = 60;
  let lastImage = null; // { tool, url (data: URL, small), at }

  // Multi-command tools reach their handler under the tool's old name, so handlers and usage counts stay the same:
  // three_do { cmd: 'keyframes' } → three_keyframes, forge_patch { action: 'save' } → forge_patch_save.
  const MULTI = {
    three_do: (a) => (a.cmd ? `three_${String(a.cmd).replace(/^three_/, '')}` : null),
    forge_patch: (a) => `forge_patch_${['save', 'list', 'remove'].includes(a.action) ? a.action : 'list'}`,
  };
  function resolve(tool, args) {
    const fn = MULTI[tool];
    if (!fn) return { tool, args };
    const real = fn(args || {});
    if (!real) return { tool, args, error: `${tool} needs ${tool === 'three_do' ? 'cmd' : 'action'}.` };
    const { cmd, ...rest } = args || {};
    return { tool: real, args: tool === 'three_do' ? rest : args, via: tool };
  }

  // The longest matching prefix wins, so a specific handler ('three_nodes') beats a general one ('three_').
  const handlerFor = (tool) => handlers.filter((x) => tool.startsWith(x.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  // "three_edit_code" + { edits: [2] } → "2 edits"; keeps the strip readable without showing whole code blocks.
  function summarize(tool, a = {}) {
    const clip = (s, n = 60) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
    if (a.code && /_(eval|run_script)$/.test(tool)) return clip(a.code);
    if (Array.isArray(a.edits)) return `${a.edits.length} edit${a.edits.length === 1 ? '' : 's'}${a.layer ? ` · ${clip(a.layer, 24)}` : ''}${a.shot ? ' · 📷' : ''}`;
    if (a.pattern) return `“${clip(a.pattern, 40)}”`;
    if (a.set && typeof a.set === 'object') return Object.entries(a.set).map(([k, v]) => `${k}=${clip(v, 12)}`).join(' ').slice(0, 70);
    if (a.from || a.to || a.around) return `${a.layer ? `${clip(a.layer, 20)} ` : ''}${a.around ? `±${a.around}` : `${a.from || 1}–${a.to || ''}`}`;
    if (a.action) return `${a.action}${a.time != null ? ` ${a.time}s` : ''}${a.name ? ` ${clip(a.name, 30)}` : ''}`;
    if (a.question) return clip(a.question);
    if (a.steps) return `${a.steps.length} steps`;
    if (a.layer) return clip(a.layer, 40);
    if (a.size || a.region || a.frames || a.compare || a.at != null) return [a.size, a.region && 'region', a.frames && `${a.frames} frames`, a.compare && 'compare', a.at != null && `@${a.at}s`].filter(Boolean).join(' · ');
    if (a.code) return `${String(a.code).split('\n').length} lines`;
    return '';
  }

  // Same text the MCP servers send (mcp/common.js fmtValue), to count what the agent reads.
  function fmtText(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'done';
    if (!v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v) || '';
    return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => {
      if (typeof x === 'string') return x.includes('\n') ? `${k}:\n${x}` : `${k}: ${x}`;
      if (Array.isArray(x) && x.length && x.every((e) => typeof e === 'string')) return `${k}:\n${x.map((e) => `  ${e}`).join('\n')}`;
      return `${k}: ${JSON.stringify(x)}`;
    }).join('\n');
  }
  // Claude bills a picture at about width × height / 750 tokens (after shrinking it to ≤ 1568 px on the long side).
  async function imageTokens(im) {
    try {
      const img = new Image();
      img.src = `data:${im.mime || 'image/png'};base64,${im.data}`;
      await img.decode();
      const k = Math.min(1, 1568 / Math.max(img.width, img.height));
      return Math.round((img.width * k * img.height * k) / 750);
    } catch { return 0; }
  }

  const emit = (entry) => { for (const fn of listeners) { try { fn(entry, log); } catch (err) { console.warn(err); } } };

  window.hub.onGameCall(async ({ id, tool: asked, args: given }) => {
    // the chat whose run made the call (mcp/common.js adds it); handlers get it as ctx.chatId, not in their args
    const { hubChatId = null, ...plain } = given || {};
    const r0 = resolve(asked, plain);
    const { tool, args } = r0;
    Usage.agentTool(tool);
    const entry = { id, tool, via: r0.via || null, agentId: args?.agentId || null, chatId: hubChatId, summary: summarize(tool, args), at: Date.now(), running: true };
    log.push(entry);
    if (log.length > LOG_MAX) log.shift();
    emit(entry);
    const h = handlerFor(tool);
    let result;
    try {
      result = r0.error ? { ok: false, error: r0.error } : h ? await h.fn(tool, args || {}, { chatId: hubChatId }) : { ok: false, error: `Nothing in the hub handles ${tool}.` };
    } catch (err) { result = { ok: false, error: err.message }; }
    result ||= { ok: false, error: `${tool} returned nothing.` };
    Object.assign(entry, { running: false, ms: Date.now() - entry.at, ok: result.ok !== false, error: result.ok === false ? String(result.error || '').slice(0, 300) : null });
    const imgs = [].concat(result.images || (result.image ? [{ data: result.image, mime: result.mime }] : [])).filter((x) => x?.data);
    if (imgs.length) { entry.image = imgs.length; lastImage = { tool, url: `data:${imgs[0].mime || 'image/png'};base64,${imgs[0].data}`, at: Date.now() }; }
    // what the agent will read: the text as the MCP server formats it (mcp/common.js) + pictures (≈ w×h / 750 tokens)
    entry.tokens = Math.round((result.ok === false ? String(result.error || '').length + 7 : fmtText(result.value).length) / 4);
    window.hub.gameResult(id, result);
    for (const im of imgs) entry.tokens += await imageTokens(im);
    emit(entry);
  });

  return {
    register(prefixes, fn) { for (const prefix of prefixes) handlers.push({ prefix, fn }); },
    // the docked director's activity strip (tools.js) and /director commands
    onCall(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    log: () => log.slice(),
    lastImage: () => lastImage,
    clearLog() { log.length = 0; lastImage = null; emit(null); },
    // Runs a tool exactly like an agent would (tests, /director try): same routing, multi-commands, logging.
    // ctx.chatId: as if that chat's run made the call (per-chat scenes, tests)
    async call(tool, args = {}, ctx = {}) {
      const r0 = resolve(tool, args);
      if (r0.error) return { ok: false, error: r0.error };
      const h = handlerFor(r0.tool);
      if (!h) return { ok: false, error: `Nothing in the hub handles ${r0.tool}.` };
      try { return await h.fn(r0.tool, r0.args || {}, { chatId: ctx.chatId || null }); } catch (err) { return { ok: false, error: err.message }; }
    },
    summarize, resolve, fmtText, imageTokens,
  };
})();
