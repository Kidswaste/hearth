// Cache-wise chats (round 32, cachewise). Both engines keep a prompt cache: a message whose beginning (tools, Hearth's
// system prompt, the chat so far) is byte-for-byte what the last one sent is read back at about a tenth of the price.
// engines.js keeps that beginning stable (no dates or ids in prompts, the parts the owner changes at the end, memory
// frozen per chat while it only grows, the picture tool kept once a chat used it); this file does the two visible bits:
//   · how much the cache saved: Cachewise.saved(cache reads, cache writes) → tokens, used by the meter and Spending;
//   · a calm one-line note, once, when something the owner changed mid-chat (personality, instructions, what the AI can
//     use, its habits, model or effort) means the next message re-reads the whole chat without the cache. Never blocks.
// The pure part (sig / diff / saved / note) runs in Node too: dev/cache-test.js.
const Cachewise = (() => {
  // Cache reads cost ≈ 0.1× fresh input (both engines); Claude's cache writes ≈ 1.25×. Saved = reads × 0.9 − writes × 0.25.
  const READ_SAVES = 0.9;
  const WRITE_COSTS = 0.25;
  const saved = (reads = 0, writes = 0) => Math.max(0, Math.round((reads || 0) * READ_SAVES - (writes || 0) * WRITE_COSTS));
  // a chat this small re-reads cheaply: no note under it
  const MIN_CTX = 4000;
  const NAMES = { p: 'its personality', i: 'its standing instructions', t: 'what it can use', h: 'its habits', m: 'the model', e: 'how hard it thinks' };
  const ORDER = ['p', 'i', 't', 'h', 'm', 'e'];

  // a short, stable hash (FNV-1a) of anything JSON can hold; object keys sorted so their order never matters
  const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, stable(v[k])])) : v);
  function hash(v) {
    const s = JSON.stringify(stable(v)) ?? '';
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const pickOf = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));
  const TOOL_KEYS = ['engine', 'threeTools', 'gameTools', 'chatTools', 'boardTools', 'captureTools', 'adobeTools', 'deployTools', 'appsTools', 'openTool', 'hubTools', 'noHubTools', 'nodesTool', 'toolMode', 'reportTool',
    'connectors', 'connections', 'workspace', 'codexFiles', 'codexFeatures', 'chatgptApps', 'webSearch', 'astraNoSandbox'];
  const HABIT_KEYS = ['name', 'suggestNext', 'autoMemory', 'selfReview', 'progressTag', 'memoryWhenRelevant', 'showThinking', 'reasoningSummary', 'verbosity'];
  // What decides a chat's cached beginning, in groups (each a short hash). chat: the chat's own picks (model, effort,
  // persona, web, access, capture tools, subagents, crew); access: what Access.sendOptions(chat) gives. The per-message
  // pick of Smart (router.js) isn't here: it is the app's own choice and already cache-aware.
  function sig(agent, chat = {}, access = null) {
    const a = agent || {};
    return {
      p: hash([a.systemPrompt || '', chat.persona || '']),
      i: hash((Array.isArray(a.instructions) ? a.instructions : []).filter((r) => r && r.on !== false && String(r.text || '').trim()).map((r) => String(r.text).trim())),
      t: hash({ ...pickOf(a, TOOL_KEYS), engine: chat.engine || a.engine, web: chat.web, access, capture: Boolean(chat.captureTools), subagents: Boolean(chat.subagents), crew: Boolean(chat.crew) }),
      h: hash(pickOf(a, HABIT_KEYS)),
      m: hash(chat.model || a.model || ''),
      e: hash(chat.effort || a.effort || ''),
    };
  }
  // which groups changed, in plain order
  const diff = (was, now) => (was && now ? ORDER.filter((k) => was[k] && now[k] && was[k] !== now[k]) : []);
  const fmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const list = (keys) => { const w = keys.map((k) => NAMES[k]); return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || ''; };
  // the one line ("now": the change was just made; else this message is the one re-reading)
  const note = (keys, ctx, { now = false } = {}) => { const w = list(keys); return `↻ ${w.charAt(0).toUpperCase()}${w.slice(1)} changed ${now ? 'mid-chat' : 'since the last message'}: ${now ? 'the next message' : 'this message'} re-reads the whole chat (≈ ${fmt(ctx)} tokens) once without the prompt cache. That's fine; a new chat starts light.`; };
  // how big the chat's context is: what its last reply sent as input
  const ctxOf = (chat) => { const m = [...(chat?.messages || [])].reverse().find((x) => x.role === 'assistant' && x.usage); return m?.usage?.input || 0; };

  // ---------- in the app ----------
  const inApp = typeof window !== 'undefined' && typeof Native !== 'undefined';
  const accessOf = (chat) => { try { return typeof Access !== 'undefined' ? Access.sendOptions(chat)?.access || null : null; } catch { return null; } };
  const sigFor = (agentId, chat) => sig(typeof H !== 'undefined' ? H.agent(agentId) : null, chat, accessOf(chat));
  // a note is due when the chat has a cached session, a context worth re-reading and a group changed since its last send
  function due(agentId, chat) {
    if (!chat?.session?.id || !chat.cacheSig) return null;
    const now = sigFor(agentId, chat);
    const keys = diff(chat.cacheSig, now);
    const ctx = ctxOf(chat);
    if (!keys.length || ctx < MIN_CTX) return null;
    const key = hash(now);
    if (chat.cacheWarned === key) return null; // once per change
    return { keys, ctx, key };
  }
  // before each send (Native.hooks.options): note a change made elsewhere (a command, the model menu), then remember
  function onOptions(agentId, chat, raw, last, options, how = {}) {
    if (how.compact) return;
    const d = due(agentId, chat);
    if (d) { chat.cacheWarned = d.key; Native.note(agentId, note(d.keys, d.ctx), { id: 'cachewise' }); }
    chat.cacheSig = sigFor(agentId, chat);
  }
  // ⋯ AI setup saved a change (options.js): the open chat of that AI hears it right away, once
  function changed(agentId) {
    if (!inApp) return;
    const chat = Native.current(agentId);
    const d = due(agentId, chat);
    if (!d) return;
    chat.cacheWarned = d.key;
    Native.note(agentId, note(d.keys, d.ctx, { now: true }), { id: 'cachewise' });
  }
  if (inApp && Native.hooks) (Native.hooks.options ||= []).push(onOptions);

  return { saved, sig, diff, note, hash, ctxOf, changed, MIN_CTX, READ_SAVES, WRITE_COSTS };
})();
if (typeof module !== 'undefined') module.exports = Cachewise; else window.Cachewise = Cachewise;
