// Token meter: live token usage and usability totals. A slim status strip at the bottom of the window
// (or a single pill in the rail) ticks while replies stream (estimated from the streamed characters,
// then snapped to the engine's real numbers), and shows this chat, today, Claude vs Astra, cache hits,
// context fill, replies and today's feature clicks. Clicking it opens the dashboard (charts per day /
// week / month, per agent / model / tool, most expensive chats, features used and never used, budgets,
// export). Aggregates live in data/kv/token-stats.json, written by the main process after every reply
// (store.js); this module only reads them. Everything here is reachable from chat commands (area Meter).
const Meter = (() => {
  const DAY = 86400000;
  const PREFS_KEY = 'meter.prefs';
  // Strip cells, in order. `on` = shown by default.
  const FIELDS = [
    { id: 'live', label: 'Streaming now', on: true },
    { id: 'chat', label: 'This chat', on: true },
    { id: 'today', label: 'Today', on: true },
    { id: 'split', label: 'Claude vs Astra (today)', on: true },
    { id: 'cache', label: 'Cache hits (today)', on: true },
    { id: 'ctx', label: 'Context fill (this chat)', on: true },
    { id: 'replies', label: 'Replies today', on: true },
    { id: 'avg', label: 'Average tokens per reply', on: true },
    { id: 'clicks', label: 'Feature clicks today', on: true },
    { id: 'week', label: 'Last 7 days', on: false },
    { id: 'speed', label: 'Reply speed (tokens/s)', on: false },
    { id: 'value', label: 'API-price value today', on: false },
    { id: 'streak', label: 'Days-in-a-row streak', on: false },
  ];
  const DEFAULTS = {
    mode: 'pill', // pill (one number in the rail, the default since round 4) | strip | off
    fields: FIELDS.filter((f) => f.on).map((f) => f.id),
    budgets: {}, // agentId -> daily tokens
    alerts: false, // budget toasts (opt-in)
    warnPct: 80,
    longCtx: 0, // tokens per message that trigger a "long context" toast; 0 = off
    badges: 'full', // per-message token line: full | compact | off
    panelTotals: true, // tokens per chat in the chats panel
    calib: {}, // engine -> learned characters per token
    windows: {}, // model -> context window override
  };
  let prefs = { ...DEFAULTS, ...store.get(PREFS_KEY, {}) };
  const savePrefs = () => store.set(PREFS_KEY, prefs);
  // Round 4: the strip moves into the rail pill once for everyone (one click on the pill, or /meter strip, brings it back).
  if (!prefs.calm) { if (prefs.mode === 'strip') prefs.mode = 'pill'; prefs.calm = 1; savePrefs(); }

  let stats = null; // token-stats.json, as written by store.js
  const live = new Map(); // chatId -> { agentId, chars, think, tools, started, shown }
  let lastSnap = null; // { agentId, chatId, est, usage, at } the latest reply that finished
  const session = { since: Date.now(), i: 0, o: 0, c: 0, r: 0 }; // since Hearth started
  let strip = null; let pill = null;

  // ---------- formatting ----------
  const fmt = (n) => {
    n = Math.round(n || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };
  const full = (n) => Math.round(n || 0).toLocaleString();
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  // (round 32, cachewise) tokens the prompt cache saved: reads cost ≈ 0.1× fresh input, Claude's writes ≈ 1.25× (cachewise.js)
  const cacheSaved = (c, w) => Math.max(0, Math.round((c || 0) * 0.9 - (w || 0) * 0.25));
  const money = (n) => (n >= 100 ? `$${Math.round(n)}` : `$${(n || 0).toFixed(2)}`);
  const SPARK = '▁▂▃▄▅▆▇█';
  const spark = (vals) => { const max = Math.max(1, ...vals); return vals.map((v) => (v ? SPARK[Math.min(7, Math.floor((v / max) * 7.999))] : '·')).join(''); };
  const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA');
  const dayKeys = (n, end = Date.now()) => Array.from({ length: n }, (_, i) => dayKey(end - (n - 1 - i) * DAY));
  const dayLabel = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00`).toLocaleDateString(undefined, opts);
  const tot = (t) => (t?.i || 0) + (t?.o || 0);
  const agentName = (id) => H.agent(id)?.name || id;
  const agentColor = (id) => H.agent(id)?.color || 'var(--accent)';
  const toolName = (id) => ({ chat: 'Chat', 'second-opinion': 'Second opinions', untracked: 'Not itemized (older replies)' }[id] || Tools.get?.(id)?.name || id);

  // ---------- aggregates ----------
  function merge(into, t) {
    for (const k of ['i', 'o', 'c', 'w', 'r', 'ms', 'tools', 'cost']) if (t?.[k]) into[k] = (into[k] || 0) + t[k];
    return into;
  }
  // { key: T } over the given days for one dimension: a = agents, m = models, t = tools
  function by(dim, days) {
    const out = {};
    for (const d of days) for (const [k, t] of Object.entries(stats?.days?.[d]?.[dim] || {})) merge(out[k] ||= {}, t);
    return out;
  }
  const sumOf = (days) => Object.values(by('a', days)).reduce(merge, {});
  const allDays = () => Object.keys(stats?.days || {}).sort();
  const RANGES = { today: 1, week: 7, month: 30, all: 0 };
  const rangeDays = (r) => (r === 'all' ? allDays() : dayKeys(RANGES[r] || 1));
  const engineOf = (agentId) => H.agent(agentId)?.engine || 'other';
  // Claude vs Astra (Codex) split over days
  function split(days) {
    const out = { claude: {}, codex: {}, other: {} };
    for (const [a, t] of Object.entries(by('a', days))) merge(out[engineOf(a)] || out.other, t);
    return out;
  }
  const astra = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  const engineLabel = (e) => (e === 'claude' ? 'Claude' : e === 'codex' ? (astra()?.name || 'Astra') : 'Other');

  // The native agent whose chat is on screen (a docked director when its tool is open).
  function activeAgentId() {
    const id = H.activeId;
    if (!id) return null;
    if (H.isTool(id)) return H.agents().find((a) => a.dock === id.slice(5) && a.mode === 'native')?.id || null;
    return H.agent(id)?.mode === 'native' ? id : null;
  }
  const activeChatId = () => { const a = activeAgentId(); return a ? H.activeChat[a] || null : null; };
  const chatStat = (chatId) => (chatId && stats?.chats?.[chatId]) || null;
  // (round 35, bugbash2) a chat continued lighter (autocompact.js) with no reply since sends the light start: its size,
  // not the long chat's last one (the chat's own context pill already said "≈ 16k" while this said 92k)
  function ctxNow(chatId, cs) {
    const chat = chatId && typeof Native !== 'undefined' ? Native.chatOf?.(activeAgentId()) : null;
    const lt = chat?.id === chatId ? chat.compact?.lighter : null;
    if (lt?.after && !chat.messages.slice(chat.compact.index).some((m) => m.role === 'assistant' && m.usage)) return lt.after;
    return cs?.ctx || 0;
  }
  // Context window of a chat's model: 1M for "[1m]" models, else 200k (or your override per model).
  function windowFor(agentId, chatId) {
    const model = chatStat(chatId)?.model || H.chats.find((c) => c.id === chatId)?.model || H.agent(agentId)?.model || 'default';
    return prefs.windows[model] || chatStat(chatId)?.contextWindow || (/\[1m\]/i.test(model) ? 1e6 : 200000);
  }
  const agentOfChat = (chatId) => H.chats.find((c) => c.id === chatId)?.agentId
    || H.agents().filter((a) => chatId?.startsWith(`${a.id}-`)).sort((a, b) => b.id.length - a.id.length)[0]?.id || null;

  // Estimated tokens from streamed text: learned characters per token per engine (starts at 4).
  const cpt = (agentId) => prefs.calib[engineOf(agentId)] || 4;
  const estimate = (l) => Math.ceil((l.chars + l.think) / cpt(l.agentId));
  const estimateText = (text, agentId) => Math.ceil(String(text || '').length / cpt(agentId || H.claudeAgent()?.id));

  // ---------- data in ----------
  let refreshing = null;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try { stats = await window.hub.getTokenStats(); } catch { /* keeps the last numbers */ }
      refreshing = null;
      checkBudgets();
      paint();
      decoratePanel();
    })();
    return refreshing;
  }
  const refreshSoon = debounce(refresh, 250);
  // Second opinions, quick asks and collaboration seats run outside a chat stream (no 'done' reaches ingest):
  // their usage is stored in the main process, so the strip just reloads (it stayed stale until the next reply).
  document.addEventListener('hearth:usage', () => refreshSoon());

  // Engine events (the same ones the chat gets). Exposed as Meter.ingest for tests and other streams.
  function ingest(ev) {
    if (!ev?.chatId) return;
    let l = live.get(ev.chatId);
    if (ev.type === 'delta' || ev.type === 'thinking' || ev.type === 'tool') {
      if (!l) live.set(ev.chatId, l = { agentId: ev.agentId || agentOfChat(ev.chatId), chars: 0, think: 0, tools: 0, started: Date.now(), shown: 0 });
      if (ev.type === 'delta') l.chars += ev.text?.length || 0;
      else if (ev.type === 'thinking') l.think += ev.text?.length || 0;
      else l.tools += 1;
      tick();
      return;
    }
    if (ev.type === 'done' || (ev.usage && (ev.type === 'error' || ev.type === 'stopped'))) {
      const agentId = l?.agentId || ev.agentId || agentOfChat(ev.chatId);
      const est = l ? estimate(l) : 0;
      // learn how many characters one output token is for this engine (only from streamed text)
      if (l && ev.usage?.output > 40 && l.chars + l.think > 200) {
        const e = engineOf(agentId);
        const seen = (l.chars + l.think) / ev.usage.output;
        if (seen > 1.5 && seen < 8) { prefs.calib[e] = Math.round(((prefs.calib[e] || 4) * 0.8 + seen * 0.2) * 100) / 100; savePrefs(); }
      }
      lastSnap = { agentId, chatId: ev.chatId, est, usage: ev.usage || null, at: Date.now() };
      if (ev.usage) merge(session, { i: ev.usage.input, o: ev.usage.output, c: ev.usage.cached, r: 1 });
      live.delete(ev.chatId);
      const context = ev.usage?.contextInput ?? ev.usage?.input;
      if (context != null && prefs.longCtx && context >= prefs.longCtx) longContextWarning(agentId, ev.chatId, context);
      if (ev.local && ev.usage) localAdd(agentId, ev.chatId, ev.usage);
      else refreshSoon();
      paint(true);
      return;
    }
    if (ev.type === 'error' || ev.type === 'stopped') { live.delete(ev.chatId); paint(); }
  }
  // Test / fake-engine path: count a reply without the main process (not saved).
  function localAdd(agentId, chatId, usage) {
    stats ||= { v: 1, since: Date.now(), days: {}, chats: {}, backfilledAt: Date.now() };
    const d = (stats.days[dayKey()] ||= { a: {}, m: {}, t: {}, h: {} });
    const t = { i: usage.input || 0, o: usage.output || 0, c: usage.cached || 0, r: 1 };
    merge(d.a[agentId] ||= {}, t); merge(d.m[H.agent(agentId)?.model || 'default'] ||= {}, t); merge(d.t[H.agent(agentId)?.dock || 'chat'] ||= {}, t);
    const h = new Date().getHours(); d.h[h] = (d.h[h] || 0) + tot(t);
    const c = (stats.chats[chatId] ||= { a: agentId }); merge(c, t); c.last = Date.now(); c.ctx = t.i; c.peak = Math.max(c.peak || 0, t.i);
    checkBudgets(); decoratePanel();
  }

  // ---------- alerts (opt-in) ----------
  const alerted = new Set(); // "day|agent|level" already shown
  function checkBudgets() {
    if (!stats) return;
    const today = by('a', [dayKey()]);
    for (const [agentId, budget] of Object.entries(prefs.budgets)) {
      if (!budget) continue;
      const used = tot(today[agentId]);
      const level = used >= budget ? 'over' : used >= budget * (prefs.warnPct / 100) ? 'warn' : null;
      if (!level || !prefs.alerts) continue;
      const key = `${dayKey()}|${agentId}|${level}`;
      if (alerted.has(key)) continue;
      alerted.add(key);
      toast(level === 'over'
        ? `${agentName(agentId)} went over today's token budget: ${fmt(used)} of ${fmt(budget)}`
        : `${agentName(agentId)} used ${pct(used, budget)}% of today's token budget (${fmt(used)} of ${fmt(budget)})`,
      { type: level === 'over' ? 'error' : 'info', timeout: 7000, action: { label: 'Budgets', fn: () => dashboard('budgets') } });
    }
  }
  // Worst budget state today across agents (colors the meter): null | 'warn' | 'over'
  function budgetState(agentId) {
    if (!stats) return null;
    const today = by('a', [dayKey()]);
    let worst = null;
    for (const [id, budget] of Object.entries(prefs.budgets)) {
      if (!budget || (agentId && id !== agentId)) continue;
      const used = tot(today[id]);
      if (used >= budget) return 'over';
      if (used >= budget * (prefs.warnPct / 100)) worst = 'warn';
    }
    return worst;
  }
  const warnedCtx = new Set();
  function longContextWarning(agentId, chatId, input) {
    if (warnedCtx.has(chatId)) return;
    warnedCtx.add(chatId);
    toast(`Long context: every message in this chat now sends about ${fmt(input)} tokens.`, {
      timeout: 9000, action: { label: '🗜 Compact', fn: () => compact(agentId) },
    });
  }
  function compact(agentId = activeAgentId()) {
    if (!agentId) { toast('Open a native chat first', { timeout: 1800 }); return false; }
    if (typeof Native.compact !== 'function') { toast('Compacting needs the chat view (Chat options → Compact context)', { timeout: 2500 }); return false; }
    Native.compact(agentId);
    return true;
  }

  // ---------- the strip and the pill ----------
  function cell(id, title, ...children) {
    return el('button', { type: 'button', class: `ms-cell ms-${id}`, title, dataset: { feature: `Meter ${id}`, cell: id } }, ...children);
  }
  function build() {
    strip = el('div', { class: 'meter-strip', attrs: { role: 'status', 'aria-live': 'off' } });
    strip.addEventListener('click', onStripClick);
    strip.addEventListener('contextmenu', (e) => { e.preventDefault(); stripMenu(e.clientX, e.clientY); });
    document.querySelector('main')?.append(strip);
    pill = el('button', { type: 'button', class: 'tool-btn meter-pill', title: 'Tokens today · click for the dashboard · right-click for the meter menu (Ctrl+Shift+U)', dataset: { feature: 'Meter pill' } },
      el('span', { class: 'mp-dot' }), el('b', { class: 'mp-num', text: '0' }), el('span', { class: 'mp-bar' }, el('i')));
    pill.addEventListener('click', () => dashboard());
    pill.addEventListener('contextmenu', (e) => { e.preventDefault(); stripMenu(e.clientX, e.clientY); });
    const rail = document.getElementById('rail');
    rail?.insertBefore(pill, document.getElementById('config-btn'));
    applyMode();
  }
  function applyMode() {
    if (!strip) return;
    strip.hidden = prefs.mode !== 'strip';
    pill.hidden = prefs.mode !== 'pill';
    document.body.classList.toggle('meter-on', prefs.mode === 'strip');
    paint(true);
  }
  function setMode(mode) {
    prefs.mode = ['strip', 'pill', 'off'].includes(mode) ? mode : prefs.mode === 'strip' ? 'pill' : 'strip';
    savePrefs();
    applyMode();
    return prefs.mode;
  }
  function onStripClick(e) {
    const c = e.target.closest('.ms-cell');
    if (!c) return;
    const id = c.dataset.cell;
    if (id === 'collapse') { setMode('pill'); toast('Meter tucked into the rail. Click the pill to bring it back.', { timeout: 2600 }); return; }
    if (id === 'ctx') { ctxMenu(e.clientX, e.clientY); return; }
    if (id === 'clicks' || id === 'streak') { dashboard('features'); return; }
    if (id === 'split') { dashboard('agents'); return; }
    if (id === 'chat') { dashboard('chats'); return; }
    dashboard();
  }
  function ctxMenu(x, y) {
    const a = activeAgentId();
    showMenu(x, y, [
      { label: '🗜 Compact this chat\'s context', action: () => compact(a) },
      { label: 'Token dashboard', action: () => dashboard() },
      { label: prefs.longCtx ? `Long-context warning: ${fmt(prefs.longCtx)} (turn off)` : 'Warn me when a chat sends over 60k per message', action: () => { prefs.longCtx = prefs.longCtx ? 0 : 60000; savePrefs(); toast(prefs.longCtx ? 'Long-context warning on (60k)' : 'Long-context warning off', { timeout: 1800 }); } },
    ]);
  }
  function stripMenu(x, y) {
    showMenu(x, y, [
      { label: 'Token dashboard (Ctrl+Shift+U)', action: () => dashboard() },
      { label: prefs.mode === 'strip' ? 'Tuck into the rail (pill)' : 'Show the meter strip', action: () => setMode(prefs.mode === 'strip' ? 'pill' : 'strip') },
      { label: 'Choose what the strip shows…', action: chooseFields },
      { label: 'Daily budgets & alerts…', action: () => dashboard('budgets') },
      { label: 'Export usage (CSV)…', action: () => exportUsage('csv') },
      { label: 'Hide the meter (/meter strip brings it back)', action: () => setMode('off') },
    ]);
  }
  async function chooseFields() {
    const r = await Modal.form('Meter strip', FIELDS.map((f) => ({ name: f.id, label: f.label, type: 'checkbox', value: prefs.fields.includes(f.id) })), { ok: 'Save' });
    if (!r) return;
    prefs.fields = FIELDS.map((f) => f.id).filter((id) => r[id]);
    savePrefs();
    paint(true);
  }

  // What every strip cell says: [text, title, extra class]
  function readings() {
    const today = sumOf([dayKey()]);
    const sp = split([dayKey()]);
    const chatId = activeChatId();
    const agentId = activeAgentId();
    const cs = chatStat(chatId);
    const liveEst = [...live.values()].reduce((s, l) => s + estimate(l), 0);
    const clicks = typeof Usage !== 'undefined' && Usage.dayStats ? Usage.dayStats() : { clicks: 0, features: 0 };
    const win = windowFor(agentId, chatId);
    const ctx = ctxNow(chatId, cs);
    const week = sumOf(dayKeys(7));
    const snapFresh = lastSnap && Date.now() - lastSnap.at < 6000 && lastSnap.usage;
    return {
      live: live.size
        ? [`● ${fmt(liveEst)}↑`, `Streaming now: about ${full(liveEst)} output tokens so far (estimated from ${full([...live.values()].reduce((s, l) => s + l.chars + l.think, 0))} characters; snaps to the real count when the reply ends)${live.size > 1 ? ` · ${live.size} replies running` : ''}`, 'is-live']
        : snapFresh ? [`✓ ${fmt(lastSnap.usage.input)}→${fmt(lastSnap.usage.output)}`, `Last reply (${agentName(lastSnap.agentId)}): ${full(lastSnap.usage.input)} in · ${full(lastSnap.usage.output)} out${lastSnap.est ? ` (estimated ${full(lastSnap.est)} out while streaming)` : ''}`, 'is-snap']
          : ['○ idle', 'Nothing streaming right now. Live token count shows here while a reply streams.', ''],
      chat: [cs ? `chat ${fmt(tot(cs))}` : 'chat –', cs ? `This chat: ${full(cs.i)} in (${full(cs.c || 0)} cached) · ${full(cs.o)} out · ${cs.r} replies${cacheSaved(cs.c, cs.w) ? ` · ≈ ${full(cacheSaved(cs.c, cs.w))} saved by the cache` : ''}` : 'This chat has no recorded replies yet', ''],
      today: [`today ${fmt(tot(today))}`, `Today: ${full(today.i)} in · ${full(today.o)} out · ${today.r || 0} replies${Object.keys(prefs.budgets).length ? ' · budgets set' : ''}`, budgetState() ? `b-${budgetState()}` : ''],
      split: [null, `Today: ${engineLabel('claude')} ${full(tot(sp.claude))} · ${engineLabel('codex')} ${full(tot(sp.codex))}${tot(sp.other) ? ` · other ${full(tot(sp.other))}` : ''}`, ''],
      cache: [`⚡${pct(today.c || 0, today.i || 0)}%`, `Cache hits today: ${full(today.c || 0)} of ${full(today.i || 0)} input tokens came from the prompt cache (cheaper and faster) · ≈ ${full(cacheSaved(today.c, today.w))} tokens saved by the cache`, ''],
      ctx: [null, ctx ? `Context: each message in this chat sends about ${full(ctx)} tokens (${pct(ctx, win)}% of a ${fmt(win)} window). Click to compact.` : 'Context fill of this chat (shows after its first reply)', ctx >= win * 0.55 ? 'b-over' : ctx >= win * 0.3 ? 'b-warn' : ''],
      replies: [`${today.r || 0} ↩`, `${today.r || 0} replies today${today.tools ? ` · ${today.tools} tool calls` : ''}`, ''],
      avg: [`⌀ ${fmt(today.r ? tot(today) / today.r : 0)}`, 'Average tokens per reply today (input + output)', ''],
      clicks: [`✦ ${clicks.clicks}`, `Usability today: ${clicks.clicks} clicks, shortcuts and commands on ${clicks.features} different features. Click for the full list.`, ''],
      week: [`7d ${fmt(tot(week))}`, `Last 7 days: ${full(tot(week))} tokens · ${week.r || 0} replies`, ''],
      speed: [`${today.ms ? Math.round((today.o || 0) / (today.ms / 1000)) : 0} t/s`, `Output tokens per second today (whole reply time, tools included) · average reply ${today.r && today.ms ? (today.ms / today.r / 1000).toFixed(1) : 0} s`, ''],
      value: [`${money(today.cost || 0)}`, `What today's Claude replies would have cost at API prices (Claude's own estimate): ${money(today.cost || 0)}. You pay $0 extra: it runs on your subscription.`, ''],
      streak: [`🔥${typeof Usage !== 'undefined' && Usage.streak ? Usage.streak().current : 0}`, 'Days in a row you used Hearth', ''],
      _sp: sp, _ctx: ctx, _win: win, _today: today,
    };
  }
  function pillReadings() {
    const chatId = activeChatId();
    const budgeted = Object.values(prefs.budgets).some((b) => b);
    const today = sumOf([dayKey()]);
    if (budgeted) return { _today: today, _ctx: 0, _win: 0 };
    return { _today: today, _ctx: ctxNow(chatId, chatStat(chatId)), _win: windowFor(activeAgentId(), chatId) };
  }
  let painted = '';
  function paint(force) {
    if (!strip) return;
    // (round 54, labsmooth54) the strip folded away (the default): only what the pill shows is worked out, not every
    // cell's text and tooltip (today's sums, the week, the split, usability…) ~8 times a second while a reply streams
    const r = strip.hidden ? pillReadings() : readings();
    // the pill: today's total, rainbow while live, budget colors
    const today = tot(r._today);
    // (only what changed is written: this runs ~8× a second while a reply streams, beside a playing Lab)
    const num = pill.querySelector('.mp-num');
    const numText = 'Usage';
    // while a reply streams the live count moves on every piece: written at most twice a second
    if (num.textContent !== numText && (!live.size || force || performance.now() - (paint.numAt || 0) > 500)) { num.textContent = numText; paint.numAt = performance.now(); }
    pill.classList.toggle('is-live', live.size > 0);
    pill.classList.toggle('b-warn', budgetState() === 'warn');
    pill.classList.toggle('b-over', budgetState() === 'over');
    const budgetTotal = Object.values(prefs.budgets).reduce((s, b) => s + (b || 0), 0);
    const fill = `${Math.min(100, budgetTotal ? pct(today, budgetTotal) : pct(r._ctx, r._win))}%`;
    if (pill.style.getPropertyValue('--fill') !== fill) pill.style.setProperty('--fill', fill);
    const pillTitle = 'Usage: what\'s left of each AI\'s plan, and Hearth\'s token traffic (Ctrl+Shift+U)'; // (round 49, appcalm) both AIs now, one sentence
    if (pill.title !== pillTitle) pill.title = pillTitle;
    if (strip.hidden) return;
    const sig = JSON.stringify([prefs.fields, Object.entries(r).filter(([k]) => !k.startsWith('_')).map(([, v]) => v), live.size]);
    if (!force && sig === painted) return;
    painted = sig;
    const cells = [];
    for (const id of prefs.fields) {
      const [text, title, cls] = r[id] || [];
      if (!r[id]) continue;
      let node;
      if (id === 'split') {
        const c = tot(r._sp.claude); const x = tot(r._sp.codex); const sum = c + x || 1;
        node = cell(id, title, el('span', { class: 'ms-k', text: engineLabel('claude')[0] }), el('span', { class: 'ms-v', text: fmt(c) }),
          el('span', { class: 'ms-splitbar' }, el('i', { class: 'c', style: { width: `${(c / sum) * 100}%` } }), el('i', { class: 'x', style: { width: `${(x / sum) * 100}%` } })),
          el('span', { class: 'ms-v', text: fmt(x) }), el('span', { class: 'ms-k', text: engineLabel('codex')[0] }));
      } else if (id === 'ctx') {
        const p = Math.min(100, pct(r._ctx, r._win));
        node = cell(id, title, el('span', { class: 'ms-k', text: 'ctx' }), el('span', { class: 'ms-gauge', style: { '--p': `${p}%` } }, el('i')), el('span', { class: 'ms-v', text: r._ctx ? `${p}%` : '–' }));
      } else node = cell(id, title, text);
      if (cls) node.classList.add(...cls.split(' '));
      cells.push(node);
    }
    cells.push(cell('collapse', 'Tuck the meter into the rail (right-click for options)', '‹'));
    strip.replaceChildren(...cells);
    strip.classList.toggle('is-live', live.size > 0);
  }
  // While replies stream the numbers tick (at most ~8 repaints a second).
  let ticking = 0;
  // (round 39, powerwise) nobody sees it while Hearth is hidden: one repaint when it's back, not 8 a second meanwhile
  let behind = false;
  function tick() {
    if (document.hidden) { behind = true; return; }
    if (ticking) return;
    ticking = setTimeout(() => { ticking = 0; paint(); }, 120);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && behind) { behind = false; tick(); } });

  // ---------- per-message badges and per-chat totals ----------
  // (round 35, concise) where the output went, so the effect of "How long its answers are" shows: the reply's own
  // words, its thinking, and the rest (tool calls: code it sent to the Lab, file edits…). Estimates (≈ characters / 4),
  // scaled to the real total; only the parts there are.
  function outSplit(m, out) {
    if (!out) return '';
    const text = Math.ceil(String(m.text || '').length / 4);
    const think = Math.ceil(String(m.thinking || '').length / 4);
    const k = text + think > out ? out / (text + think) : 1;
    const parts = [[Math.round(text * k), 'written'], [Math.round(think * k), 'thinking'], [out - Math.round(text * k) - Math.round(think * k), m.tools?.length ? 'tool calls' : 'other']];
    const shown = parts.filter(([n], i) => n > 0 && (i < 2 || m.tools?.length || n >= out * 0.1));
    return shown.length > 1 ? `: ${shown.map(([n, w]) => `≈ ${full(n)} ${w}`).join(' · ')}` : '';
  }
  // The token line under a reply (native.js calls this). Full: in · out · cached % · time; compact: total.
  function badge(m) {
    const u = m?.usage;
    if (!u) return null;
    const secs = m.ms ? m.ms / 1000 : 0;
    const title = ['Token traffic for this reply, not a subscription allowance or bill. Input is counted again on each model call.',
      `${full(u.input)} input tokens${u.cached ? ` (${full(u.cached)} from cache, ${pct(u.cached, u.input)}%)` : ''}`,
      u.cacheWrite ? `${full(u.cacheWrite)} written to cache` : null,
      `${full(u.output)} output tokens${u.reasoning != null ? ` (includes ${full(u.reasoning)} reasoning tokens)` : outSplit(m, u.output)}`,
      u.contextInput != null ? `${full(u.contextInput)} input tokens in the final model call (current context)` : null,
      m.answers ? `Answers: ${m.answers} (⋯ AI setup)` : null, secs ? `${secs.toFixed(1)} s total` : null,
      u.cost ? `≈ ${money(u.cost)} at API list prices; not your subscription usage or bill` : null].filter(Boolean).join('\n');
    if (prefs.badges === 'off') return null;
    if (prefs.badges === 'compact') return el('span', { class: 'meter-badge compact', title, text: `${fmt(u.output)} out` });
    return el('span', { class: 'meter-badge', title },
      el('span', { text: `${fmt(u.output)} out` }), ' · ', el('span', { text: `${fmt(Math.max(0, (u.input || 0) - (u.cached || 0)))} fresh in` }),
      u.cached ? el('span', { class: 'mb-cache', text: ` · ${fmt(u.cached)} cached`, title: 'Previously processed input served from cache; included in total input, not extra tokens.' }) : null,
      secs ? ` · ${secs.toFixed(1)}s` : null);
  }
  // "12k" for the chats panel (null when the chat has no recorded replies).
  function chatTotal(chatOrId) {
    const id = typeof chatOrId === 'string' ? chatOrId : chatOrId?.id;
    const c = chatStat(id);
    if (c) return fmt(tot(c));
    const msgs = typeof chatOrId === 'object' ? chatOrId?.messages : null;
    const n = (msgs || []).reduce((s, m) => s + (m.usage ? m.usage.input + m.usage.output : 0), 0);
    return n ? fmt(n) : null;
  }
  // Adds the totals to the chats panel rows (re-applied whenever the panel re-renders).
  function decoratePanel() {
    const root = document.getElementById('chat-groups');
    if (!root) return;
    for (const row of root.querySelectorAll('.item')) decorateRow(row);
  }
  // (round 42, chatlistfast) one row: the chats list keeps rows between draws and adds new ones inside its groups
  function decorateRow(row) {
    const has = row.querySelector('.item-tok');
    if (!prefs.panelTotals) { has?.remove(); return; }
    const c = chatStat(row.dataset.key);
    if (!c) { has?.remove(); return; }
    const text = fmt(tot(c));
    const title = `${full(tot(c))} tokens of traffic, including repeated and cached input · ${c.r} replies · not subscription usage`;
    if (has) { if (has.textContent !== text) { has.textContent = text; has.title = title; } return; }
    row.append(el('span', { class: 'item-tok', text, title }));
  }

  // ---------- dashboard ----------
  const TABS = [
    { id: 'overview', label: 'Overview' }, { id: 'agents', label: 'Agents' }, { id: 'models', label: 'Models' },
    { id: 'tools', label: 'Tools' }, { id: 'chats', label: 'Chats' }, { id: 'features', label: 'Features' },
    { id: 'budgets', label: 'Budgets & alerts' }, { id: 'export', label: 'Export' },
  ];
  // (round 83, firstscreen83) the dashboard itself (its tabs and panes, the canvas charts, the Codex account card) is in
  // meter-dash.js, out of the first screen: lazy group 'meterdash', loaded in an idle moment after it or when the
  // dashboard first opens. Same code; what it reads from here comes through Meter._dash.
  async function dashboard(tab) { if (window.Lazy) await Lazy.load('meterdash'); return MeterDash.dashboard(tab); }
  const dashOpen = () => (window.Lazy ? Lazy.isIn('meterdash') : typeof MeterDash !== 'undefined') && MeterDash.dlg?.open && MeterDash.dlg; // open now: its close event (which forgets it) comes a task later, and a quick Ctrl+Shift+U after a close must reopen it
  // average tokens per weekday over every recorded day (Mon first)
  function weekdays() {
    const acc = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
    for (const d of allDays()) { const w = (new Date(`${d}T12:00`).getDay() + 6) % 7; acc[w].sum += tot(sumOf([d])); acc[w].n += 1; }
    return acc.map((x, i) => ({ label: new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }), avg: x.n ? Math.round(x.sum / x.n) : 0, n: x.n }));
  }

  // ---------- export ----------
  function csv() {
    const lines = ['date,kind,key,name,input,cached,cache_write,output,replies,ms,tool_calls,api_value_usd'];
    const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    for (const d of allDays()) {
      for (const [dim, kind, nameOf] of [['a', 'agent', agentName], ['m', 'model', (k) => k], ['t', 'tool', toolName]]) {
        for (const [k, t] of Object.entries(stats.days[d][dim] || {})) lines.push([d, kind, q(k), q(nameOf(k)), t.i || 0, t.c || 0, t.w || 0, t.o || 0, t.r || 0, t.ms || 0, t.tools || 0, t.cost || 0].join(','));
      }
    }
    return lines.join('\n');
  }
  function markdown(days = dayKeys(7)) {
    const rows = days.map((d) => { const t = sumOf([d]); return `| ${d} | ${full(t.i)} | ${full(t.c || 0)} | ${full(t.o)} | ${t.r || 0} |`; });
    return ['| Day | Input | Cached | Output | Replies |', '|---|---:|---:|---:|---:|', ...rows].join('\n');
  }
  async function exportUsage(kind = 'csv') {
    await refresh();
    if (kind === 'md') { await copyText(markdown(), 'Token table'); return 'Copied the last 7 days as a Markdown table.'; }
    const json = kind === 'json';
    const content = json ? JSON.stringify({ exported: new Date().toISOString(), tokens: stats, features: Usage.data ? { since: Usage.data.since, days: Usage.data.days, items: Usage.data.items } : null }, null, 2) : csv();
    const file = await window.hub.saveFile({ defaultPath: `hearth-token-usage-${dayKey()}.${json ? 'json' : 'csv'}`, filters: [json ? { name: 'JSON', extensions: ['json'] } : { name: 'CSV', extensions: ['csv'] }], content });
    if (file) toast(`Saved ${file}`, { timeout: 2500 });
    return file ? `Saved to ${file}` : '';
  }
  async function rebuild() {
    stats = await window.hub.rebuildTokenStats();
    paint(true); decoratePanel();
    toast('Token stats rebuilt from your chats', { timeout: 1800 });
  }

  // ---------- chat command helpers ----------
  const line = (label, t) => `**${label}**: ${full(tot(t))} tokens (${full(t.i)} in, ${pct(t.c || 0, t.i || 0)}% cached · ${full(t.o)} out) · ${t.r || 0} replies${t.r ? ` · ⌀ ${fmt(tot(t) / t.r)}` : ''}`;
  function report(range) {
    const days = rangeDays(range);
    const s = sumOf(days);
    const sp = split(days);
    const name = { today: 'Today', week: 'Last 7 days', month: 'Last 30 days', all: 'All time' }[range];
    const out = [line(name, s), `${engineLabel('claude')} ${fmt(tot(sp.claude))} · ${engineLabel('codex')} ${fmt(tot(sp.codex))}${tot(sp.other) ? ` · other ${fmt(tot(sp.other))}` : ''}`];
    if (days.length > 1) out.push(`\`${spark(days.slice(-30).map((d) => tot(sumOf([d]))))}\` per day`);
    if (range === 'today') { const h = stats?.days?.[dayKey()]?.h || {}; out.push(`\`${spark(Array.from({ length: 24 }, (_, i) => h[i] || 0))}\` by hour (0–23)`); }
    if (typeof Usage !== 'undefined' && Usage.dayStats && range === 'today') { const c = Usage.dayStats(); out.push(`Usability: ${c.clicks} clicks on ${c.features} features today`); }
    return out.join('\n');
  }
  const pickRange = (args) => { const a = (args || '').toLowerCase(); return a.startsWith('w') ? 'week' : a.startsWith('m') ? 'month' : a.startsWith('a') || a.startsWith('l') ? 'all' : a.startsWith('t') || a.startsWith('d') ? 'today' : null; };
  const RANGE_ARGS = ['today', 'week', 'month', 'all'].map((v) => ({ value: v }));
  const agentArg = (q) => { const s = String(q || '').toLowerCase().trim(); return H.agents().find((a) => a.mode === 'native' && (a.id.toLowerCase() === s || a.name.toLowerCase() === s)) || H.agents().find((a) => a.mode === 'native' && a.name.toLowerCase().startsWith(s)); };
  const AGENT_ARGS = (args) => H.agents().filter((a) => a.mode === 'native' && a.name.toLowerCase().startsWith(String(args || '').toLowerCase().split(' ')[0])).map((a) => ({ value: a.name }));
  // "60k", "1.5m", "200000" -> number
  const parseTokens = (s) => { const m = String(s || '').trim().toLowerCase().match(/^([\d.]+)\s*([km]?)$/); return m ? Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1)) : NaN; };
  function dimReport(dim, range, nameOf) {
    const rows = Object.entries(by(dim, rangeDays(range))).sort((a, b) => tot(b[1]) - tot(a[1]));
    if (!rows.length) return 'Nothing recorded in this range.';
    return rows.map(([k, t]) => `- ${line(nameOf(k), t)}`).join('\n');
  }
  const featureList = (items, n = 20, show = (x) => `${x.n}×`) => items.slice(0, n).map((x) => `- ${x.label || x.key} · ${x.area || ''} · ${show(x)}`).join('\n');

  // ---------- chat commands ----------
  const R = (def) => Commands.register({ area: 'Meter', ...def });
  function registerCommands() {
    R({ name: 'tokens', aliases: ['tok'], override: true, // replaces the chat stream's simpler /tokens
    args: '[today|week|month|all|chat|<agent> [range]]', desc: 'Token totals (this chat, today, week, month, all time or one agent)', complete: (a) => [...RANGE_ARGS, { value: 'chat' }, ...AGENT_ARGS(a)].filter((x) => x.value.toLowerCase().startsWith(a.toLowerCase())),
      run: async (args) => {
        await refresh();
        if (/^chat/i.test(args)) return PANE_TEXT.chat();
        const word = args.split(/\s+/)[0];
        const agent = word && !['today', 'week', 'month', 'all'].includes(word.toLowerCase()) ? agentArg(word) : null;
        if (agent) {
          const r = pickRange(args.split(/\s+/)[1]) || 'week';
          return `${line(`${agent.name}, ${r === 'today' ? 'today' : r === 'all' ? 'all time' : `last ${rangeDays(r).length} days`}`, by('a', rangeDays(r))[agent.id] || {})}\n\`${spark(dayKeys(14).map((d) => tot(stats?.days?.[d]?.a?.[agent.id])))}\` last 14 days`;
        }
        return report(pickRange(args) || 'today');
      } });
    R({ name: 'usage', aliases: ['dashboard', 'token-usage'], args: '[tab]', desc: 'Open the token & usage dashboard (overview, agents, models, tools, chats, features, budgets, export)',
      complete: (a) => TABS.filter((t) => t.id.startsWith(a.toLowerCase())).map((t) => ({ value: t.id, hint: t.label })),
      run: (args) => { dashboard(TABS.find((t) => t.id.startsWith((args || '').toLowerCase()) && args)?.id); } });
    R({ name: 'meter', args: '[strip|pill|off|fields|window <model> <tokens>|reset]', desc: 'Show the meter as a strip, a rail pill or hide it; choose its fields',
      complete: () => ['strip', 'pill', 'off', 'toggle', 'fields', 'window', 'reset'].map((value) => ({ value })),
      run: (args) => {
        const [cmd, ...rest] = (args || 'toggle').split(/\s+/);
        if (cmd === 'fields') { chooseFields(); return; }
        if (cmd === 'reset') { const keep = { budgets: prefs.budgets, calib: prefs.calib }; prefs = { ...DEFAULTS, ...keep }; savePrefs(); applyMode(); return 'Meter back to its defaults (budgets kept).'; }
        if (cmd === 'window') {
          const n = parseTokens(rest.at(-1)); const model = rest.slice(0, -1).join(' ');
          if (!model || !n) return 'Usage: /meter window <model> <tokens>, e.g. /meter window opus 1m';
          prefs.windows[model] = n; savePrefs(); paint(true); return `Context window for ${model}: ${fmt(n)} tokens.`;
        }
        const mode = setMode(['strip', 'pill', 'off'].includes(cmd) ? cmd : 'toggle');
        return `Meter: ${mode === 'strip' ? 'strip at the bottom' : mode === 'pill' ? 'pill in the rail' : 'hidden (/meter strip brings it back)'}.`;
      } });
    R({ name: 'meter-field', args: '<field> [on|off]', desc: 'Show or hide one meter strip field', complete: (a) => FIELDS.filter((f) => f.id.startsWith(a.split(' ')[0].toLowerCase())).map((f) => ({ value: f.id, hint: f.label })),
      run: (args) => {
        const [id, onoff] = args.split(/\s+/);
        if (!FIELDS.some((f) => f.id === id)) return `Fields: ${FIELDS.map((f) => `\`${f.id}\` ${f.label}`).join(' · ')}`;
        const on = onoff ? onoff === 'on' : !prefs.fields.includes(id);
        prefs.fields = FIELDS.map((f) => f.id).filter((f) => (f === id ? on : prefs.fields.includes(f)));
        savePrefs(); paint(true);
        return `${FIELDS.find((f) => f.id === id).label}: ${on ? 'shown' : 'hidden'}.`;
      } });
    R({ name: 'budget', args: '[agent] <tokens|off>', desc: 'Set a daily token budget for an agent (e.g. /budget Claude 300k)', complete: AGENT_ARGS,
      run: async (args) => {
        await refresh();
        if (!args) return budgetsText();
        const parts = args.split(/\s+/);
        const amount = parts.pop();
        const agent = parts.length ? agentArg(parts.join(' ')) : H.agent(activeAgentId()) || H.claudeAgent();
        if (!agent) return `No native agent called “${parts.join(' ')}”.`;
        if (/^(off|none|0)$/i.test(amount)) { delete prefs.budgets[agent.id]; savePrefs(); paint(true); return `No budget for ${agent.name}.`; }
        const n = parseTokens(amount);
        if (!n) return 'Give an amount like 300k or 1.5m (or off).';
        prefs.budgets[agent.id] = n;
        if (!prefs.alerts) prefs.alerts = true;
        savePrefs(); alerted.clear(); checkBudgets(); paint(true);
        return `${agent.name}: daily budget ${fmt(n)} tokens (alerts on, warning at ${prefs.warnPct}%). Today so far: ${fmt(tot(by('a', [dayKey()])[agent.id]))}.`;
      } });
    R({ name: 'budgets', desc: 'Every daily token budget and how much is used today', run: async () => { await refresh(); return budgetsText(); } });
    R({ name: 'budget-warn', args: '<percent>', desc: 'At what % of a budget the meter warns (default 80)', run: (args) => { const n = Number(String(args).replace('%', '')); if (!(n >= 10 && n <= 100)) return 'Give a percent between 10 and 100.'; prefs.warnPct = n; savePrefs(); paint(true); return `Budget warning at ${n}%.`; } });
    R({ name: 'alerts', args: '[on|off]', desc: 'Budget notifications on or off', complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (args) => { prefs.alerts = args ? /^on|yes|1/i.test(args) : !prefs.alerts; savePrefs(); return `Budget alerts ${prefs.alerts ? 'on' : 'off'}.`; } });
    R({ name: 'long-warn', aliases: ['context-warn'], args: '<tokens|off>', desc: 'Warn when a chat sends more than this per message (e.g. 60k)',
      run: (args) => { if (/^(off|0)$/i.test(args)) { prefs.longCtx = 0; savePrefs(); return 'Long-context warning off.'; } const n = parseTokens(args); if (!n) return `Long-context warning is ${prefs.longCtx ? fmt(prefs.longCtx) : 'off'}. Set it with /long-warn 60k.`; prefs.longCtx = n; savePrefs(); return `Long-context warning at ${fmt(n)} tokens per message.`; } });
    R({ name: 'cost-free', aliases: ['free', 'api-value'], args: '[today|week|month|all]', desc: 'What your replies would have cost at API prices (you pay $0 extra)', complete: () => RANGE_ARGS,
      run: async (args) => {
        await refresh();
        const r = pickRange(args) || 'month';
        const s = sumOf(rangeDays(r));
        const claude = split(rangeDays(r)).claude;
        return s.cost
          ? `**${money(s.cost)}** is what ${full(claude.r || 0)} Claude replies (${fmt(tot(claude))} tokens) would have cost through the API (${r === 'all' ? 'all time' : `last ${rangeDays(r).length} day${rangeDays(r).length === 1 ? '' : 's'}`}, Claude's own estimate). Through your subscription it cost **$0 extra**. Astra's replies (${fmt(tot(split(rangeDays(r)).codex))} tokens) aren't priced by Codex.`
          : `Cost-free: ${fmt(tot(s))} tokens on your subscriptions, $0 extra. (API-price estimates appear for Claude replies made from now on.)`;
      } });
    R({ name: 'stats-today', aliases: ['today'], desc: 'Today: tokens, Claude vs Astra, by hour, feature clicks', run: async () => { await refresh(); return report('today'); } });
    R({ name: 'stats-week', aliases: ['week'], desc: 'Last 7 days of tokens with a sparkline', run: async () => { await refresh(); return report('week'); } });
    R({ name: 'stats-month', aliases: ['month'], desc: 'Last 30 days of tokens with a sparkline', run: async () => { await refresh(); return report('month'); } });
    R({ name: 'lifetime', aliases: ['all-time'], desc: 'All-time token totals', run: async () => { await refresh(); return `${report('all')}\nTracking since ${new Date(stats?.since || Date.now()).toLocaleDateString()}.`; } });
    R({ name: 'compare', desc: 'Today vs yesterday, this week vs last week', run: async () => {
      await refresh();
      const d = (a, b) => (b ? `${a >= b ? '+' : ''}${pct(a - b, b)}%` : a ? 'new' : '–');
      const t = tot(sumOf([dayKey()])); const y = tot(sumOf([dayKey(Date.now() - DAY)]));
      const w = tot(sumOf(dayKeys(7))); const lw = tot(sumOf(dayKeys(7, Date.now() - 7 * DAY)));
      return `**Today** ${fmt(t)} vs yesterday ${fmt(y)} (${d(t, y)})\n**This week** ${fmt(w)} vs last week ${fmt(lw)} (${d(w, lw)})`;
    } });
    R({ name: 'forecast', desc: 'Where this month is heading at the current pace', run: async () => {
      await refresh();
      const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = dayKeys(now.getDate()); const sum = tot(sumOf(days));
      const len = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const perDay = sum / days.length;
      return `${first.toLocaleDateString(undefined, { month: 'long' })} so far: ${fmt(sum)} tokens in ${days.length} days (⌀ ${fmt(perDay)}/day). At this pace: **${fmt(perDay * len)}** by the end of the month.`;
    } });
    R({ name: 'hourly', desc: 'Today by hour as a sparkline', run: async () => { await refresh(); const h = stats?.days?.[dayKey()]?.h || {}; const v = Array.from({ length: 24 }, (_, i) => h[i] || 0); const top = v.indexOf(Math.max(...v)); return `\`${spark(v)}\` 0h → 23h${Math.max(...v) ? ` · busiest ${top}:00 (${fmt(v[top])})` : ''}`; } });
    R({ name: 'daily', args: '[days]', desc: 'Tokens per day for the last N days (default 14)', run: async (args) => {
      await refresh();
      const n = Math.min(90, Math.max(2, Number(args) || 14)); const days = dayKeys(n);
      return `\`${spark(days.map((d) => tot(sumOf([d]))))}\` last ${n} days\n${days.slice(-7).map((d) => `- ${dayLabel(d)}: ${fmt(tot(sumOf([d])))}`).join('\n')}`;
    } });
    R({ name: 'top-chats', aliases: ['expensive'], args: '[n]', desc: 'The chats that used the most tokens', run: async (args) => {
      await refresh();
      const rows = Object.entries(stats?.chats || {}).sort((a, b) => tot(b[1]) - tot(a[1])).slice(0, Math.min(30, Number(args) || 8));
      return rows.length ? rows.map(([id, c], i) => `${i + 1}. ${H.chats.find((x) => x.id === id)?.title || '(deleted chat)'} · ${agentName(c.a)} · **${fmt(tot(c))}** · ${c.r} replies · context ${fmt(c.ctx || 0)}`).join('\n') : 'No chats with recorded replies yet.';
    } });
    R({ name: 'top-features', aliases: ['most-used'], args: '[n]', desc: 'Your most used features (clicks, shortcuts, commands)', run: (args) => featureList(Object.entries(Usage.data?.items || {}).map(([key, v]) => ({ key, ...v })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n), Number(args) || 15) || 'Nothing tracked yet.' });
    R({ name: 'unused', aliases: ['never-used'], args: '[area]', desc: 'Controls you have seen but never used (hide them with /hide-feature)', run: (args) => {
      const list = Usage.never().filter((x) => !args || x.area.toLowerCase().includes(args.toLowerCase()) || x.key.toLowerCase().includes(args.toLowerCase()));
      return list.length ? `${list.length} never used${args ? ` (“${args}”)` : ''}:\n${featureList(list, 40, () => 'never')}` : 'Nothing unused there.';
    } });
    R({ name: 'hide-feature', args: '<name>', desc: 'Hide a control everywhere (/show-feature brings it back)', complete: (a) => Usage.find(a).slice(0, 10).map((x) => ({ value: x.key })),
      run: (args) => { const hit = Usage.find(args)[0]; if (!hit) return `No control matches “${args}”.`; Usage.setHidden(hit.key, true); return `Hidden: ${hit.key}. /show-feature ${hit.label} brings it back.`; } });
    R({ name: 'show-feature', aliases: ['unhide'], args: '<name|all>', desc: 'Bring a hidden control back', complete: (a) => (Usage.data?.hidden || []).filter((k) => k.toLowerCase().includes(a.toLowerCase())).map((k) => ({ value: k })),
      run: (args) => {
        const hidden = Usage.data?.hidden || [];
        if (/^all$/i.test(args)) { for (const k of [...hidden]) Usage.setHidden(k, false); return 'Every hidden control is back.'; }
        const key = hidden.find((k) => k.toLowerCase() === args.toLowerCase()) || hidden.find((k) => k.toLowerCase().includes(args.toLowerCase()));
        if (!key) return hidden.length ? `Hidden now: ${hidden.join(' · ')}` : 'Nothing is hidden.';
        Usage.setHidden(key, false); return `Back: ${key}.`;
      } });
    R({ name: 'hidden', desc: 'List the controls you hid', run: () => { const h = Usage.data?.hidden || []; return h.length ? h.map((k) => `- ${k}`).join('\n') : 'Nothing is hidden.'; } });
    R({ name: 'hot', desc: 'Your hot features (highlighted in the app)', run: () => featureList(Usage.hot(), 25) || 'Nothing hot yet.' });
    R({ name: 'cold', args: '[days]', desc: 'Features you used before but not lately (default 21 days)', run: (args) => featureList(Usage.cold(Number(args) || 21), 30, (x) => timeAgo(x.last)) || 'Nothing has gone cold.' });
    R({ name: 'streak', desc: 'Days in a row you used Hearth', run: () => { const s = Usage.streak(); return `🔥 ${s.current} day${s.current === 1 ? '' : 's'} in a row (best ${s.best}).`; } });
    R({ name: 'areas', desc: 'Clicks per app area', run: () => Usage.byArea().map(([a, n]) => `- ${a}: ${n}`).join('\n') || 'Nothing tracked yet.' });
    R({ name: 'feature', args: '<name>', desc: 'How often you used a feature and when', complete: (a) => Usage.find(a).slice(0, 10).map((x) => ({ value: x.label || x.key, hint: x.area })),
      run: (args) => { const hits = Usage.find(args).slice(0, 6); return hits.length ? hits.map((x) => `- ${x.key}: ${x.n}× · last ${x.last ? timeAgo(x.last) : 'never'}${(Usage.data.hidden || []).includes(x.key) ? ' · hidden' : ''}`).join('\n') : `No feature matches “${args}”.`; } });
    R({ name: 'clicks', desc: 'Feature clicks today (the meter\'s usability total)', run: () => { const c = Usage.dayStats(); return `${c.clicks} clicks on ${c.features} features today.${c.top.length ? `\nTop: ${c.top.slice(0, 5).map((x) => `${x.key.split(' › ').pop()} ${x.n}×`).join(' · ')}` : ''}`; } });
    R({ name: 'features', aliases: ['your-usage'], desc: 'Open "Your usage": every feature, used and never used', run: () => { Usage.dialog(); } });
    R({ name: 'context', aliases: ['ctx'], override: true, // replaces the chat stream's /context args: '[compact]', desc: 'How full this chat\'s context is; /ctx compact compacts it', complete: () => [{ value: 'compact' }],
      run: async (args, ctx) => {
        await refresh();
        if (/^compact/i.test(args)) { compact(ctx.agentId); return; }
        const c = chatStat(ctx.chatId);
        if (!c) return 'This chat has no recorded replies yet.';
        const win = windowFor(ctx.agentId, ctx.chatId);
        const p = pct(c.ctx || 0, win);
        return `Context: **${full(c.ctx || 0)}** tokens per message (${p}% of ${fmt(win)}) \`${'█'.repeat(Math.round(p / 10))}${'░'.repeat(10 - Math.round(p / 10))}\` · peak ${fmt(c.peak || 0)}.${p >= 30 ? ' Consider /ctx compact.' : ''}`;
      } });
    R({ name: 'cache', args: '[today|week|month|all]', desc: 'Prompt-cache hit ratio', complete: () => RANGE_ARGS, run: async (args) => {
      await refresh();
      const r = pickRange(args) || 'today'; const s = sumOf(rangeDays(r));
      return `Cache hits (${r}): **${pct(s.c || 0, s.i || 0)}%** · ${full(s.c || 0)} of ${full(s.i || 0)} input tokens${s.w ? ` · ${full(s.w)} written to cache` : ''} · **≈ ${full(cacheSaved(s.c, s.w))} tokens saved by the cache**`;
    } });
    R({ name: 'models', args: '[range]', desc: 'Tokens per model', complete: () => RANGE_ARGS, run: async (args) => { await refresh(); return dimReport('m', pickRange(args) || 'week', (m) => m); } });
    R({ name: 'by-agent', aliases: ['agents-usage'], args: '[range]', desc: 'Tokens per agent', complete: () => RANGE_ARGS, run: async (args) => { await refresh(); return dimReport('a', pickRange(args) || 'week', agentName); } });
    R({ name: 'by-tool', aliases: ['tools-usage'], args: '[range]', desc: 'Tokens per tool (docked directors, chat, second opinions)', complete: () => RANGE_ARGS, run: async (args) => { await refresh(); return dimReport('t', pickRange(args) || 'week', toolName); } });
    R({ name: 'split', aliases: ['claude-vs-astra'], args: '[range]', desc: 'Claude vs Astra token split', complete: () => RANGE_ARGS, run: async (args) => {
      await refresh();
      const r = pickRange(args) || 'today'; const sp = split(rangeDays(r)); const sum = tot(sp.claude) + tot(sp.codex) || 1;
      const bar = (n) => '█'.repeat(Math.round((n / sum) * 20));
      return `${engineLabel('claude')} \`${bar(tot(sp.claude)) || '·'}\` ${fmt(tot(sp.claude))} (${sp.claude.r || 0} replies)\n${engineLabel('codex')} \`${bar(tot(sp.codex)) || '·'}\` ${fmt(tot(sp.codex))} (${sp.codex.r || 0} replies)`;
    } });
    R({ name: 'replies', args: '[range]', desc: 'Reply count, average tokens and tool calls per reply', complete: () => RANGE_ARGS, run: async (args) => {
      await refresh();
      const s = sumOf(rangeDays(pickRange(args) || 'today'));
      return s.r ? `${full(s.r)} replies · ⌀ ${fmt(tot(s) / s.r)} tokens (${fmt(s.i / s.r)} in, ${fmt(s.o / s.r)} out) · ${((s.tools || 0) / s.r).toFixed(1)} tool calls each` : 'No replies in this range.';
    } });
    R({ name: 'speed', args: '[range]', desc: 'Average reply time and output tokens per second', complete: () => RANGE_ARGS, run: async (args) => {
      await refresh();
      const s = sumOf(rangeDays(pickRange(args) || 'week'));
      return s.ms && s.r ? `⌀ ${(s.ms / s.r / 1000).toFixed(1)} s per reply · ${Math.round(s.o / (s.ms / 1000))} output tokens/s (tools and thinking included)` : 'No timed replies in this range.';
    } });
    R({ name: 'peak', desc: 'Your busiest day and hour', run: async () => {
      await refresh();
      const days = allDays(); if (!days.length) return 'No replies recorded yet.';
      const best = days.reduce((b, d) => (tot(sumOf([d])) > tot(sumOf([b])) ? d : b));
      const hours = Array(24).fill(0); for (const d of days) for (const [h, v] of Object.entries(stats.days[d].h || {})) hours[h] += v;
      const hh = hours.indexOf(Math.max(...hours));
      return `Busiest day: **${dayLabel(best)}** (${fmt(tot(sumOf([best])))}) · busiest hour overall: **${hh}:00** \`${spark(hours)}\``;
    } });
    R({ name: 'streaming', aliases: ['live-tokens'], desc: 'Replies streaming right now with their estimated tokens', run: () => (live.size ? [...live.entries()].map(([id, l]) => `- ${agentName(l.agentId)} · ${H.chats.find((c) => c.id === id)?.title || id} · ≈${fmt(estimate(l))} out so far · ${l.tools} tool calls · ${Math.round((Date.now() - l.started) / 1000)} s`).join('\n') : 'Nothing is streaming.') });
    R({ name: 'estimate', aliases: ['count-tokens'], args: '[text]', desc: 'Estimate the tokens of some text (or of your draft)', run: (args, ctx) => {
      const text = args || ctx.input?.value || '';
      if (!text) return 'Type /estimate followed by text, or write a draft first.';
      return `≈ **${full(estimateText(text, ctx.agentId))}** tokens (${full(text.length)} characters at ${cpt(ctx.agentId)} per token${prefs.calib[engineOf(ctx.agentId)] ? ', learned from your replies' : ''}).`;
    } });
    R({ name: 'last-reply', aliases: ['msg-tokens'], desc: 'Token breakdown of the last reply in this chat', run: async (args, ctx) => {
      const chat = ctx.chatId ? await window.hub.getChat(ctx.chatId) : null;
      const m = [...(chat?.messages || [])].reverse().find((x) => x.usage);
      if (!m) return 'No reply with token usage in this chat yet.';
      const u = m.usage;
      return `Last reply: **${full(u.input)}** in${u.cached ? ` (${full(u.cached)} cached, ${pct(u.cached, u.input)}%)` : ''} · **${full(u.output)}** out${m.ms ? ` · ${(m.ms / 1000).toFixed(1)} s` : ''}${m.tools?.length ? ` · ${m.tools.length} tool calls` : ''}${u.cost ? ` · ≈ ${money(u.cost)} at API prices` : ''}`;
    } });
    R({ name: 'chat-tokens', desc: 'This chat\'s token totals', run: async () => { await refresh(); return PANE_TEXT.chat(); } });
    R({ name: 'badges', args: '[full|compact|off]', desc: 'How the token line under each reply looks', complete: () => ['full', 'compact', 'off'].map((value) => ({ value })),
      run: (args) => { prefs.badges = ['full', 'compact', 'off'].includes(args) ? args : prefs.badges === 'full' ? 'compact' : 'full'; savePrefs(); const a = activeAgentId(); if (a) Native.refresh(a, { keepScroll: true }); toast(`Reply token badges: ${prefs.badges}`, { timeout: 1600 }); } });
    R({ name: 'panel-totals', args: '[on|off]', desc: 'Show tokens per chat in the chats panel', complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (args) => { prefs.panelTotals = args ? /^on|yes|1/i.test(args) : !prefs.panelTotals; savePrefs(); decoratePanel(); return `Chat totals in the panel: ${prefs.panelTotals ? 'on' : 'off'}.`; } });
    R({ name: 'export-usage', aliases: ['tokens-export'], args: '[csv|json|md]', desc: 'Save your token history as CSV / JSON, or copy a Markdown table', complete: () => ['csv', 'json', 'md'].map((value) => ({ value })),
      run: (args) => exportUsage(['json', 'md'].includes(args) ? args : 'csv') });
    R({ name: 'usage-rebuild', desc: 'Recount the token stats from every chat\'s recorded replies', run: async () => { await rebuild(); return `Rebuilt: ${allDays().length} days, ${Object.keys(stats?.chats || {}).length} chats.`; } });
    R({ name: 'session', desc: 'Tokens since Hearth started', run: () => `${line(`Since ${new Date(session.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, session)}` });
    R({ name: 'budget-left', aliases: ['left'], desc: 'Tokens left today in each budget', run: async () => {
      await refresh();
      const today = by('a', [dayKey()]);
      const rows = Object.entries(prefs.budgets).filter(([, b]) => b).map(([a, b]) => { const left = b - tot(today[a]); return `- ${agentName(a)}: ${left >= 0 ? `**${fmt(left)}** left` : `**${fmt(-left)}** over`} of ${fmt(b)}`; });
      return rows.join('\n') || 'No budgets set. Try /budget Claude 300k.';
    } });
    R({ name: 'weekdays', desc: 'Your average tokens per weekday', run: async () => { await refresh(); const wd = weekdays(); return `\`${spark(wd.map((x) => x.avg))}\` ${wd.map((x) => `${x.label} ${fmt(x.avg)}`).join(' · ')}`; } });
    R({ name: 'calibration', desc: 'How live estimates turn characters into tokens (learned per engine)', run: () => `Characters per token: ${['claude', 'codex'].map((e) => `${engineLabel(e)} ${prefs.calib[e] || '4 (default)'}`).join(' · ')}. Learned from streamed replies, used for the live meter and /estimate.` });
  }
  const PANE_TEXT = {
    chat() {
      const id = activeChatId();
      const c = chatStat(id);
      if (!c) return 'This chat has no recorded replies yet.';
      return `${line('This chat', c)}\nContext now ${full(c.ctx || 0)} · peak ${full(c.peak || 0)}${c.tools ? ` · ${c.tools} tool calls` : ''}${c.cost ? ` · ≈ ${money(c.cost)} at API prices` : ''}`;
    },
  };
  function budgetsText() {
    const today = by('a', [dayKey()]);
    const rows = Object.entries(prefs.budgets).filter(([, b]) => b).map(([a, b]) => `- ${agentName(a)}: ${fmt(tot(today[a]))} of ${fmt(b)} (${pct(tot(today[a]), b)}%)`);
    return rows.length ? `${rows.join('\n')}\nAlerts ${prefs.alerts ? 'on' : 'off'} · warning at ${prefs.warnPct}%` : 'No budgets. Set one with /budget Claude 300k (or in the dashboard → Budgets & alerts).';
  }

  // ---------- start ----------
  async function init() {
    build();
    registerCommands();
    window.hub.onEngineEvent(ingest);
    if (typeof Usage !== 'undefined' && Usage.onTrack) Usage.onTrack(() => tick());
    const groups = document.getElementById('chat-groups');
    if (groups) new MutationObserver(() => { if (prefs.panelTotals) decoratePanel(); }).observe(groups, { childList: true });
    if (typeof Panel !== 'undefined') Panel.hooks?.row?.push((row) => { if (prefs.panelTotals && row.dataset.key) decorateRow(row); }); // (round 42) rows made inside a kept group
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') { e.preventDefault(); const open = dashOpen(); if (open) open.close(); else dashboard(); Usage.key?.('Ctrl+Shift+U', 'Token dashboard'); }
    });
    for (const [label, fn] of [
      ['Usage: what\'s left, tokens, budgets', () => dashboard()], // (round 49, appcalm) one name: the window, the rail pill and this row say Usage (was Token dashboard)
      ['Usage › Tools: tokens per tool', () => dashboard('tools')],
      ['Copy a usage summary of the last 7 days (Markdown)', () => copyText(report('week'), 'Usage summary')],
      ['Meter: strip / rail pill', () => setMode(prefs.mode === 'strip' ? 'pill' : 'strip')],
      ['Meter: choose fields', chooseFields],
      ['Daily token budgets & alerts', () => dashboard('budgets')],
      ['Most expensive chats', () => dashboard('chats')],
      ['Features used today / never used', () => dashboard('features')],
      ['Export token usage (CSV)', () => exportUsage('csv')],
      ['Export token usage (JSON)', () => exportUsage('json')],
      ['Compact this chat\'s context', () => compact()],
    ]) AppUI.addAction?.(label, fn, /^Usage: what/.test(label) ? 'Ctrl+Shift+U' : '');
    // the context fill and "this chat" follow whichever chat is on screen
    // (start.js fires 'hearth:view' when that changes; this used to poll every 700 ms)
    let seen = '';
    addEventListener('hearth:view', () => { const s = `${H.activeId}|${activeChatId()}`; if (s !== seen) { seen = s; paint(); } });
    // midnight: "today" starts over (one timer to the next midnight instead of a check every minute)
    let day = dayKey();
    const midnight = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2) - n; };
    const atMidnight = () => { if (dayKey() !== day) { day = dayKey(); alerted.clear(); refresh(); } setTimeout(atMidnight, Math.min(midnight(), 3600000)); };
    setTimeout(atMidnight, Math.min(midnight(), 3600000));
    await refresh();
  }

  return {
    init, ingest, refresh, dashboard, badge, chatTotal, compact, exportUsage, setMode, estimateText,
    get stats() { return stats; }, get prefs() { return prefs; }, get live() { return live; },
    _test: { fmt, spark, parseTokens, sumOf, by, dayKeys, csv, markdown, readings },
    // (round 83) for meter-dash.js only
    _dash: { savePrefs, fmt, full, pct, cacheSaved, money, dayKey, dayKeys, dayLabel, tot, agentName, agentColor, toolName, by, sumOf, allDays, RANGES, rangeDays, split, engineLabel, activeAgentId, activeChatId, chatStat, windowFor, refresh, alerted, checkBudgets, budgetState, compact, paint, TABS, weekdays, exportUsage, rebuild, report },
  };
})();
