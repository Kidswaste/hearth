// Where its tokens go (round 36, tokenaudit). Inside ⋯ AI setup → Spending (folded, no new rows elsewhere): the fixed
// part each message to this AI carries before the owner's words, measured from what its engine really gets
// (tokenauditmain.js: engines.js promptParts + the tool definitions), in calm lines:
//   · Its instructions: who it is, the Lab how-to, habits, personality, standing instructions, file access, memory,
//     answer length… each with its tokens; an over-long instruction, personality or memory gets "Shorten" (opens it).
//   · Its tools: Hearth's tool sets, claude.ai connectors, your own connections, hooks (0: they run in Hearth), each
//     with its tokens and "used N times this week"; one unused for 30 days gets "Turn off — not used in 30 days"
//     (a director's own tools never). A trim is one click, never silent: a toast with Undo.
//   · What the prompt cache usually covers, and what trimming would save per message and per week at your own use.
// One line, once, in the Spending fold's summary when an unused tool costs more than ≈ 500 tokens a message.
// Tool use is counted per AI from the replies' own tool lists (Native.hooks.event), kept 35 days in kv 'tool-use',
// started from the last 35 days of chats; usage.js's per-day counts (every AI) keep a tool any AI used from looking
// unused. Reads only: no prompt, flag or message changes (dev/cache-test.js). Rules: tokenaudit-core.js.
const TokenAudit = (() => {
  const C = TokenAuditCore;
  const LOG_KEY = 'tool-use';
  const SEEN_KEY = 'tokenaudit.nudged'; // { 'agentId|toolKey': at }: each nudge shows once
  const OPEN_KEY = 'tokenaudit.open';
  const TTL = 30000; // a measure is reused this long for the same AI setup (memory can change underneath)
  let log = null;
  let loading = null;
  const pend = [];
  let saveT = 0;
  const measured = new Map(); // agent signature → { at, p: Promise<measure> }
  const last = new Map(); // agentId → the last breakdown shown
  let seen = {};
  try { seen = store.get(SEEN_KEY, {}) || {}; } catch { seen = {}; }

  // ---------- the tool-use log ----------
  function loadLog() {
    loading ||= (async () => {
      let v = null;
      try { v = await window.hub.kvGet(LOG_KEY, null); } catch { /* none yet */ }
      if (!v || typeof v !== 'object' || !v.days) {
        let s = null;
        try { s = await window.hub.tokenAuditSeed?.(); } catch { /* no history */ }
        v = s && !s.error && s.days ? s : { since: Date.now(), days: {} };
        pend.length = 0; // the seed read the chats those replies were saved in
        log = v;
        saveSoon();
      }
      log = v;
      for (const [id, names, at] of pend.splice(0)) C.addUse(log, id, names, at);
      return log;
    })();
    return loading;
  }
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { if (log) window.hub.kvSet(LOG_KEY, log).catch(() => {}); }, 1500); }
  function onEvent(event, chat) {
    if (event?.type !== 'done' || !chat?.agentId) return;
    const m = chat.messages?.at(-1);
    if (m?.role !== 'assistant' || !Array.isArray(m.tools) || !m.tools.length) return;
    if (!log) { pend.push([chat.agentId, m.tools.slice(), Date.now()]); loadLog(); return; }
    if (C.addUse(log, chat.agentId, m.tools)) saveSoon();
  }

  // ---------- measuring ----------
  const clean = (a) => JSON.parse(JSON.stringify(a));
  function measure(a, fresh = false) {
    const sig = JSON.stringify(clean(a));
    const c = measured.get(sig);
    if (!fresh && c && Date.now() - c.at < TTL) return c.p;
    const p = Promise.resolve(window.hub.tokenAudit?.(clean(a))).then((m) => (m && !m.error ? m : null)).catch(() => null);
    measured.set(sig, { at: Date.now(), p });
    if (measured.size > 24) measured.delete(measured.keys().next().value);
    return p;
  }
  const stats = () => (typeof Meter !== 'undefined' ? Meter.stats : null);
  function useOf(agentId) {
    const s = stats();
    let replies = 0; let input = 0; let cached = 0;
    for (const d of C.daysBack(7)) { const t = s?.days?.[d]?.a?.[agentId]; if (t) { replies += t.r || 0; input += t.i || 0; cached += t.c || 0; } }
    return { replies, cache: { input, cached } };
  }
  async function breakdownOf(a, fresh = false) {
    const [m] = await Promise.all([measure(a, fresh), loadLog()]);
    if (!m) return null;
    const u = useOf(a.id);
    const b = C.breakdown(m, { agent: a, log, dayItems: typeof Usage !== 'undefined' ? Usage.data?.dayItems : null, weekReplies: u.replies, cache: u.cache });
    last.set(a.id, b);
    return b;
  }

  // ---------- trims (one click, never silent: a toast with Undo) ----------
  async function save(a, patch) {
    for (const t of new Set([a, H.agent(a.id)].filter(Boolean))) for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete t[k]; else t[k] = v; }
    await saveConfig();
    if (typeof Cachewise !== 'undefined') Cachewise.changed(a.id); // a mid-chat change: its one calm line about the cache
  }
  // the same switch ⋯ AI setup turns (tokenauditmain.js without() measures exactly this)
  function offPatch(a, t) {
    if (t.kind === 'set') {
      if (t.id === 'chatTools') return a.engine === 'codex' ? { chatTools: undefined, hubTools: undefined } : { chatTools: false };
      if (t.id === 'openTool') return { openTool: false };
      return { [t.id]: undefined };
    }
    const field = t.kind === 'connector' ? 'connectors' : 'connections';
    const next = { ...(a[field] || {}) };
    delete next[t.id];
    return { [field]: Object.keys(next).length ? next : undefined };
  }
  async function turnOff(agentId, line, { quiet = false } = {}) {
    const a = H.agent(agentId);
    if (!a || !line?.trim) return false;
    const patch = offPatch(a, line);
    const undo = Object.fromEntries(Object.keys(patch).map((k) => [k, a[k] === undefined ? undefined : clean({ v: a[k] }).v]));
    await save(a, patch);
    markSeen(agentId, line.key);
    measured.clear();
    if (!quiet) {
      toast(`${line.label} off for ${a.name}: ≈ ${C.fmt(line.trim.saves)} fewer tokens with each message.`, { timeout: 7000, action: { label: 'Undo', fn: () => { const b = H.agent(agentId); if (b) save(b, undo).then(() => { measured.clear(); repaintOpen(); }); } } });
    }
    return true;
  }
  async function shorten(agentId, line) {
    const a = H.agent(agentId);
    if (!a) return;
    if (line.trim?.what === 'memory' || line.key === 'memory') {
      if (typeof MemoryEditor !== 'undefined') MemoryEditor.open({}); else Commands.exec('/memory edit', agentId);
      return;
    }
    if (line.trim?.what === 'personality') {
      const t = await Modal.prompt(`Shorten ${a.name}'s personality (≈ ${line.tokens} tokens with every message)`, { value: a.systemPrompt || '', multiline: true });
      if (t != null && t.trim() && t.trim() !== a.systemPrompt) { await save(a, { systemPrompt: t.trim() }); measured.clear(); repaintOpen(); }
      return;
    }
    const list = Array.isArray(a.instructions) ? a.instructions : [];
    const r = list[line.index];
    if (!r) return;
    const t = await Modal.prompt(`Shorten this instruction (≈ ${line.tokens} tokens with every message)`, { value: r.text, multiline: true });
    if (t != null && t.trim() && t.trim() !== r.text) { await save(a, { instructions: list.map((x, j) => (j === line.index ? { ...x, text: t.trim().slice(0, 600) } : x)) }); measured.clear(); repaintOpen(); }
  }

  // ---------- the nudge: once, in the Spending fold's summary ----------
  function markSeen(agentId, key) { if (seen[`${agentId}|${key}`]) return; seen[`${agentId}|${key}`] = Date.now(); try { store.set(SEEN_KEY, seen); } catch { /* no storage */ } }
  function nudge(a) {
    const n = last.get(a?.id)?.nudge;
    return n && !seen[`${a.id}|${n.key}`] ? n.text : '';
  }

  // ---------- the part in Spending ----------
  let repaintOpen = () => {};
  const n = (x) => Number(x || 0).toLocaleString();
  function lineEl(label, tokens, { meta = '', title = '', button = null, sub = false, est = false } = {}) {
    return el('div', { class: `ta-line${sub ? ' ta-sub' : ''}`, title },
      el('span', { class: 'ta-l' }, el('span', { text: label }), meta ? el('small', { text: meta }) : null),
      el('b', { text: `${est ? '≈ ' : ''}${n(tokens)}` }),
      button);
  }
  function section(a, { repaint } = {}) {
    repaintOpen = () => repaint?.();
    let open = false;
    try { open = store.get(OPEN_KEY, false) === true; } catch { /* no storage */ }
    const sum = el('span', { class: 'opt-sum', text: 'measuring…' });
    const body = el('div', { class: 'ta-body' }, el('p', { class: 'opt-hint', text: 'Measuring what its engine gets…' }));
    const d = el('details', { class: 'ta', attrs: { 'data-ta': '' } }, el('summary', { class: 'opt-fold-sum' }, el('span', { class: 'opt-fold-h', text: 'Where its tokens go' }), sum), body);
    d.open = open;
    d.addEventListener('toggle', () => { try { store.set(OPEN_KEY, d.open); } catch { /* no storage */ } });
    breakdownOf(a).then((b) => {
      if (!b) { sum.textContent = ''; body.replaceChildren(el('p', { class: 'opt-hint', text: 'It can\'t be measured here.' })); return; }
      sum.textContent = `≈ ${C.fmt(b.total)} with each message`;
      body.replaceChildren(...render(a, b, repaint));
      // the nudge, once: in the fold's summary while it's closed; seen once the fold is opened
      const fold = d.closest('details[data-fold="spending"]');
      const text = nudge(a);
      if (!fold || !text) return;
      const seenIt = () => markSeen(a.id, b.nudge.key);
      if (fold.open) { seenIt(); return; }
      const s = fold.querySelector(':scope > summary .opt-sum');
      if (s && !s.textContent.includes(text)) s.textContent = `${s.textContent ? `${s.textContent} · ` : ''}${text}`;
      fold.addEventListener('toggle', () => { if (fold.open) seenIt(); }, { once: true });
    });
    return d;
  }
  function render(a, b, repaint) {
    const off = (line) => {
      const btn = el('button', { type: 'button', class: 'ghost small ta-trim', text: 'Turn off — not used in 30 days', title: `Saves ≈ ${n(line.trim.saves)} tokens with each message${b.weekReplies ? ` (≈ ${C.fmt(line.trim.saves * b.weekReplies)} a week at your use)` : ''}. You can turn it back on in What it can use.` });
      btn.addEventListener('click', async () => { btn.disabled = true; if (await turnOff(a.id, line)) repaint?.(); });
      return btn;
    };
    const short = (line) => el('button', { type: 'button', class: 'ghost small ta-trim', text: 'Shorten', title: `Over-long: a short version saves ≈ ${n(line.trim.saves)} tokens with each message`, on: { click: () => shorten(a.id, line) } });
    const prompt = b.prompt.filter((p) => p.tokens || p.note).flatMap((p) => [
      lineEl(p.label, p.tokens, { meta: p.note || '', button: p.trim ? short(p) : null }),
      ...(p.rules || []).filter((r) => r.trim).map((r) => lineEl(`“${r.label.length > 48 ? `${r.label.slice(0, 47)}…` : r.label}”`, r.tokens, { sub: true, title: r.label, button: short(r) })),
    ]);
    const tools = b.tools.map((t) => {
      const kind = t.kind === 'connector' ? 'claude.ai' : t.kind === 'conn' ? 'yours' : '';
      const used = b.since ? `used ${t.used} time${t.used === 1 ? '' : 's'} this week` : '';
      return lineEl(kind ? `${t.label} (${kind})` : t.label, t.tokens, {
        meta: [used, t.estimate ? 'estimated' : ''].filter(Boolean).join(' · '), est: t.estimate,
        title: t.guide ? `${n(t.tokens)} for its tool definitions + ${n(t.guide)} for its line in the instructions` : t.estimate ? 'Claude doesn\'t report a connector\'s definitions: ≈ an estimate from its number of tools' : '',
        button: t.trim ? off(t) : null,
      });
    });
    tools.push(lineEl('Hooks', 0, { meta: `${b.hooks ? `${b.hooks} on · ` : ''}they run in Hearth, not in the prompt` }));
    const cache = b.cacheShare == null ? 'After the first message of a chat, the prompt cache usually reads this part at about a tenth of the price.'
      : `This week the prompt cache covered ≈ ${Math.round(b.cacheShare * 100)}% of what it read, at about a tenth of the price; this part is almost always in it.`;
    const save = b.savePerMsg
      ? `Trimming what's suggested: ≈ ${n(b.savePerMsg)} fewer tokens a message${b.weekReplies ? ` · ≈ ${C.fmt(b.perWeek)} a week at your use (${n(b.weekReplies)} repl${b.weekReplies === 1 ? 'y' : 'ies'} in 7 days)` : ''}.`
      : b.tracked ? 'Nothing to trim: everything here was used or is needed.' : `Tools unused for 30 days get a "Turn off" here (tracked since ${new Date(b.since).toLocaleDateString()}).`;
    return [
      el('p', { class: 'opt-hint', text: `Each message to ${a.name} starts with ≈ ${n(b.total)} tokens before your words: ${n(b.promptTotal)} of instructions, ${n(b.toolsTotal)} of tool definitions.` }),
      el('div', { class: 'ta-group' }, el('h5', { text: `Its instructions · ${n(b.promptTotal)}` }), ...prompt),
      el('div', { class: 'ta-group' }, el('h5', { text: `Its tools · ${n(b.toolsTotal)}` }), ...tools),
      el('p', { class: 'opt-hint', text: cache }),
      el('p', { class: `ta-save${b.savePerMsg ? ' on' : ''}`, text: save }),
    ];
  }

  // ---------- in words (the command), the palette ----------
  async function text(a) {
    const b = await breakdownOf(a, true);
    if (!b) return 'It can\'t be measured here.';
    const L = [`**${a.name}**: ≈ ${n(b.total)} tokens with each message before your words (${n(b.promptTotal)} instructions · ${n(b.toolsTotal)} tools).`];
    for (const p of b.prompt.filter((x) => x.tokens || x.note)) L.push(`- ${p.label}: ${n(p.tokens)}${p.note ? ` (${p.note.toLowerCase()})` : ''}${p.trim ? ' · could be shorter' : ''}`);
    for (const t of b.tools) L.push(`- ${t.label}${t.kind === 'connector' ? ' (claude.ai)' : t.kind === 'conn' ? ' (yours)' : ''}: ${t.estimate ? '≈ ' : ''}${n(t.tokens)} · used ${t.used}× this week${t.trim ? ' · not used in 30 days' : ''}`);
    if (b.savePerMsg) L.push(`Trimming: ≈ ${n(b.savePerMsg)} fewer a message${b.weekReplies ? `, ≈ ${C.fmt(b.perWeek)} a week` : ''}. ⋯ AI setup → Spending → Where its tokens go.`);
    return L.join('\n');
  }
  function openHere(agentId) {
    try { store.set(OPEN_KEY, true); } catch { /* no storage */ }
    if (typeof Options !== 'undefined') Options.open({ agentId: agentId || undefined, show: 'spending' });
  }
  if (typeof Native !== 'undefined' && Native.hooks) Native.hooks.event.push(onEvent);
  if (typeof Commands !== 'undefined' && !Commands.get('token-audit')) {
    Commands.register({
      name: 'token-audit', aliases: ['where-tokens-go'], area: 'Meter', args: '[open]',
      desc: 'Where this AI\'s fixed tokens go with each message: its instructions and tools, how often each tool is used, what trimming would save',
      keywords: 'tokens system prompt tools connectors definitions fixed cost trim unused audit',
      examples: ['/token-audit', '/token-audit open'],
      complete: () => [{ value: 'open', hint: 'in ⋯ AI setup → Spending' }],
      run: async (args, ctx) => {
        const id = H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : H.claudeAgent()?.id;
        if (/^open/i.test(String(args || '').trim())) { openHere(id); return null; }
        const a = H.agent(id);
        return a ? text(a) : 'No chat AI here.';
      },
    });
  }
  AppUI.addAction?.('Spending: where its tokens go', () => openHere(H.agent(H.activeId)?.mode === 'native' ? H.activeId : null));
  loadLog();

  return { section, nudge, text, breakdownOf, turnOff, offPatch, open: openHere, get log() { return log; }, _test: { measure, onEvent, loadLog, setLog: (v) => { log = v; loading = Promise.resolve(v); measured.clear(); }, reset: () => { measured.clear(); last.clear(); seen = {}; try { store.set(SEEN_KEY, seen); } catch { /* none */ } } } };
})();
window.TokenAudit = TokenAudit;
