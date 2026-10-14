// Where its tokens go (round 36, tokenaudit), the pure part. Every message an AI gets starts with the same fixed part
// before the owner's words: Hearth's system prompt (engines.js promptParts: personality, instructions, memory, habits,
// file access line, answer length…) and the definitions of every tool it has (Hearth's tool sets, claude.ai connectors,
// the owner's own connections). tokenauditmain.js measures them from what the engine really gets; this file turns that
// into calm lines: tokens each, how often each tool was used, and the trims that are safe ("Turn off — not used in 30
// days" for a tool, "Shorten" for an over-long instruction / personality / memory), with what trimming saves per
// message and per week at the owner's own use. Nothing here changes a prompt: it only reads.
// Tokens ≈ characters / 4 (mcp/cost.js tok, dev/tokens-test.js). Runs in Node too: dev/tokenaudit-test.js.
const TokenAuditCore = (() => {
  const DAY = 864e5;
  const UNUSED_DAYS = 30; // "not used in 30 days"
  const KEEP_DAYS = 35; // the tool-use log keeps this many days
  const NUDGE_AT = 500; // an unused tool costing more than this per message gets one line in the Spending fold's summary
  // Shorten: offered past LONG, saving what is over SHORT (a short version of the same thing)
  const LONG = { instruction: 60, personality: 120, memory: 200 };
  const SHORT = { instruction: 30, personality: 60, memory: 120 };
  const tok = (s) => Math.round(String(s || '').length / 4);
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const daysBack = (n, now = Date.now()) => { const d = new Date(now); return Array.from({ length: n }, (_, i) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (n - 1 - i), 12).getTime())); };
  // this week: Monday (local) through today (the same week as Spending, budget-core.js)
  const weekDays = (now = Date.now()) => daysBack(((new Date(now).getDay() + 6) % 7) + 1, now);
  const fmt = (n) => { n = Math.round(n || 0); if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`; if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`; return String(n); };

  // what each prompt part is, in plain words (engines.js promptParts keys)
  const PART = {
    role: 'Who it is', game: 'Forgeheart game how-to', 'guide:gameTools': 'Forgeheart tools guide', 'guide:chatTools': 'Chat tools guide',
    suggest: 'Habit: suggests next steps', 'guide:boardTools': 'Mood board line', 'guide:appsTools': 'App windows line',
    selfReview: 'Habit: checks its own work', progress: 'Habit: progress bar', director: 'Three Director how-to', crew: 'Lab crew line',
    web: 'Web search line', remember: 'Habit: remembers lasting facts', personality: 'Personality', instructions: 'Standing instructions',
    access: 'File access line', folder: 'Project folder line', apps: 'Connected apps line', notools: '"No tools" line',
    memory: 'Memory', answers: 'Answer length',
  };
  // a prompt part that belongs to a tool set goes when the set goes (its trim saves both)
  const GUIDE_OF = { boardTools: ['guide:boardTools'], appsTools: ['guide:appsTools'], chatTools: ['guide:chatTools', 'suggest'], gameTools: ['game', 'guide:gameTools'] };
  const SET = {
    threeTools: 'Lab tools', chatTools: 'Your chats and Hearth', openTool: 'Open pages and files', gameTools: 'Forgeheart game', boardTools: 'Mood board',
    captureTools: 'Screenshots and recordings', appsTools: 'App windows', adobeTools: 'Adobe', deployTools: 'Publishing',
  };
  const OPTIONAL = ['boardTools', 'captureTools', 'appsTools', 'adobeTools', 'deployTools', 'openTool'];

  // ---------- which tool a call belongs to ----------
  // Claude: mcp__<server>__<tool>[ · file]; Codex: "<server> · <tool>"; built-ins (Read, Shell · …) belong to no server
  function serverOf(name, known) {
    const s = String(name || '');
    let m = /^mcp__(.+?)__/.exec(s);
    if (m) return m[1];
    m = /^([\w-]+) · [\w-]+$/.exec(s);
    if (m && (!known || known.has(m[1]))) return m[1];
    return null;
  }
  // a hub tool's bare name (usage.js "Agent tool › three_eval": every AI together) → its server
  const HUB_PREFIX = { three: 'three', chat: 'chat', board: 'board', capture: 'capture', apps: 'apps', meshy: 'apps', adobe: 'adobe', deploy: 'deploy', forge: 'forgeheart' };
  const hubServerOf = (tool) => HUB_PREFIX[String(tool || '').split('_')[0]] || null;

  // ---------- the tool-use log: { since, days: { day: { agentId: { server: n } } } } ----------
  function addUse(log, agentId, names, now = Date.now()) {
    const servers = (names || []).map((n) => serverOf(n)).filter(Boolean);
    if (!servers.length || !agentId) return false;
    const day = ((log.days ||= {})[dayKey(now)] ||= {});
    const mine = (day[agentId] ||= {});
    for (const s of servers) mine[s] = (mine[s] || 0) + 1;
    const keep = new Set(daysBack(KEEP_DAYS, now));
    for (const d of Object.keys(log.days)) if (!keep.has(d)) delete log.days[d];
    return true;
  }
  function usesOf(log, agentId, servers, days) {
    let n = 0;
    for (const d of days) { const t = log?.days?.[d]?.[agentId]; if (t) for (const s of servers) n += t[s] || 0; }
    return n;
  }
  // every AI's calls of a hub server in usage.js's own per-day counts (it keeps 35 days): never "unused" when any AI used it
  function hubUses(dayItems, servers, days) {
    let n = 0;
    for (const d of days) for (const [k, v] of Object.entries(dayItems?.[d] || {})) { const m = /^Agent tool › (.+)$/.exec(k); if (m && servers.includes(hubServerOf(m[1]))) n += v || 0; }
    return n;
  }

  // largest-remainder rounding: whole tokens per line that add up to the whole prompt's tokens exactly
  function apportion(chars) {
    const total = Math.round(chars.reduce((a, b) => a + b, 0) / 4);
    const raw = chars.map((c) => c / 4);
    const out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1;
    return out;
  }

  // ---------- the breakdown ----------
  // m: tokenauditmain.js measure() → { parts: [[key, text]], tools: [{ key, kind: 'set'|'connector'|'conn', id, name, tokens, servers, estimate }], hooks, memory }
  // o: { agent, log, dayItems, weekReplies, cache: { cached, input }, now }
  function breakdown(m, o = {}) {
    const now = o.now || Date.now();
    const agent = o.agent || {};
    const parts = Array.isArray(m?.parts) ? m.parts : [];
    // each part with the "\n\n" that joins it to the one before (engines.js buildPrompt), so the lines add up
    const chars = parts.map(([, t], i) => String(t).length + (i ? 2 : 0));
    const each = apportion(chars);
    const byKey = new Map();
    parts.forEach(([k], i) => byKey.set(k, (byKey.get(k) || 0) + each[i]));
    const prompt = [...byKey.entries()].map(([key, tokens]) => ({ key, label: PART[key] || key, tokens }));
    const promptTotal = each.reduce((a, b) => a + b, 0);
    // Shorten: an over-long personality / memory, and each over-long standing instruction
    const trims = [];
    const shorten = (line, kind, tokens, extra = {}) => {
      if (tokens <= LONG[kind]) return null;
      const t = { kind: 'shorten', what: kind, key: line.key, saves: tokens - SHORT[kind], ...extra };
      trims.push(t);
      return t;
    };
    for (const p of prompt) {
      if (p.key === 'personality') p.trim = shorten(p, 'personality', p.tokens);
      if (p.key === 'memory') p.trim = shorten(p, 'memory', p.tokens);
      if (p.key === 'instructions') {
        const rules = (Array.isArray(agent.instructions) ? agent.instructions : []).map((r, i) => [r, i]).filter(([r]) => r && r.on !== false && String(r.text || '').trim());
        p.rules = rules.map(([r, i]) => {
          const text = String(r.text).trim().slice(0, 600);
          const line = { key: `rule:${i}`, index: i, label: text, tokens: tok(`- ${text}`) };
          line.trim = shorten(line, 'instruction', line.tokens, { index: i });
          return line;
        });
      }
    }
    if (m?.memory === 'relevant') prompt.push({ key: 'memory', label: PART.memory, tokens: 0, note: 'Only with the messages it\'s about (it\'s long)' });
    // the tools: Hearth's sets (+ the prompt lines that go with them), connectors, the owner's connections
    const week = weekDays(now);
    const month = daysBack(UNUSED_DAYS, now);
    const tracked = o.log?.since && now - o.log.since >= UNUSED_DAYS * DAY;
    const director = Boolean(agent.dock) || Boolean(agent.threeTools) || Boolean(agent.gameTools);
    const tools = (Array.isArray(m?.tools) ? m.tools : []).map((t) => {
      const guide = t.kind === 'set' ? (GUIDE_OF[t.id] || []).reduce((n, k) => n + (byKey.get(k) || 0), 0) : 0;
      const used = usesOf(o.log, agent.id, t.servers || [], week);
      const used30 = usesOf(o.log, agent.id, t.servers || [], month) + (t.kind === 'set' ? hubUses(o.dayItems, t.servers || [], month) : 0);
      // safe to switch off: an opt-in set, the chat tools of a plain chat, a connector, a connection (never a director's own tools)
      const safe = t.kind !== 'set' || OPTIONAL.includes(t.id) || (t.id === 'chatTools' && !director);
      const line = { key: t.key, kind: t.kind, id: t.id, label: t.kind === 'set' ? (SET[t.id] || t.id) : t.name, tokens: t.tokens || 0, guide, used, used30, estimate: Boolean(t.estimate), servers: t.servers || [] };
      // what switching it off saves: measured with it off (tokenauditmain.js: the prompt lines that go with it, and a
      // line that would come instead), else its definitions + its guide lines
      const saves = Number.isFinite(t.saves) ? t.saves : line.tokens + guide;
      if (safe && tracked && !used30 && saves > 0) {
        line.trim = { kind: 'off', key: t.key, id: t.id, what: t.kind, saves };
        trims.push(line.trim);
      }
      return line;
    });
    const toolsTotal = tools.reduce((n, t) => n + t.tokens, 0);
    const total = promptTotal + toolsTotal;
    const savePerMsg = trims.reduce((n, t) => n + t.saves, 0);
    const replies = Math.max(0, o.weekReplies || 0);
    const cacheShare = o.cache?.input > 0 ? Math.max(0, Math.min(1, (o.cache.cached || 0) / o.cache.input)) : null;
    // one line, once: the biggest unused tool past NUDGE_AT tokens a message
    const big = tools.filter((t) => t.trim && t.trim.saves > NUDGE_AT).sort((a, b) => b.trim.saves - a.trim.saves)[0];
    const nudge = big ? { key: big.key, text: `${big.label}: ≈ ${fmt(big.trim.saves)} tokens a message, not used in 30 days` } : null;
    return { prompt, promptTotal, tools, toolsTotal, total, trims, savePerMsg, perWeek: savePerMsg * replies, weekReplies: replies, cacheShare, hooks: m?.hooks || 0, tracked: Boolean(tracked), since: o.log?.since || 0, nudge };
  }

  return { breakdown, serverOf, hubServerOf, addUse, usesOf, hubUses, apportion, weekDays, daysBack, dayKey, fmt, tok, PART, SET, OPTIONAL, GUIDE_OF, LONG, SHORT, UNUSED_DAYS, KEEP_DAYS, NUDGE_AT };
})();
if (typeof module !== 'undefined') module.exports = TokenAuditCore;
else window.TokenAuditCore = TokenAuditCore;
