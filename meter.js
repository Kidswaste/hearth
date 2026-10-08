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
    mode: 'strip', // strip | pill | off
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

  let stats = null; // token-stats.json, as written by store.js
  const live = new Map(); // chatId -> { agentId, chars, think, tools, started, shown }
  let lastSnap = null; // { agentId, chatId, est, usage, at } the latest reply that finished
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
  // Context window of a chat's model: 1M for "[1m]" models, else 200k (or your override per model).
  function windowFor(agentId, chatId) {
    const model = chatStat(chatId)?.model || H.chats.find((c) => c.id === chatId)?.model || H.agent(agentId)?.model || 'default';
    return prefs.windows[model] || (/\[1m\]/i.test(model) ? 1e6 : 200000);
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
    if (ev.type === 'done') {
      const agentId = l?.agentId || ev.agentId || agentOfChat(ev.chatId);
      const est = l ? estimate(l) : 0;
      // learn how many characters one output token is for this engine (only from streamed text)
      if (l && ev.usage?.output > 40 && l.chars + l.think > 200) {
        const e = engineOf(agentId);
        const seen = (l.chars + l.think) / ev.usage.output;
        if (seen > 1.5 && seen < 8) { prefs.calib[e] = Math.round(((prefs.calib[e] || 4) * 0.8 + seen * 0.2) * 100) / 100; savePrefs(); }
      }
      lastSnap = { agentId, chatId: ev.chatId, est, usage: ev.usage || null, at: Date.now() };
      live.delete(ev.chatId);
      if (ev.usage && prefs.longCtx && ev.usage.input >= prefs.longCtx) longContextWarning(agentId, ev.chatId, ev.usage.input);
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
    if (id === 'collapse') { setMode('pill'); toast('Meter tucked into the rail. Click the pill (or /meter strip) to bring it back.', { timeout: 2600 }); return; }
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
    const ctx = cs?.ctx || 0;
    const week = sumOf(dayKeys(7));
    const snapFresh = lastSnap && Date.now() - lastSnap.at < 6000 && lastSnap.usage;
    return {
      live: live.size
        ? [`● ${fmt(liveEst)}↑`, `Streaming now: about ${full(liveEst)} output tokens so far (estimated from ${full([...live.values()].reduce((s, l) => s + l.chars + l.think, 0))} characters; snaps to the real count when the reply ends)${live.size > 1 ? ` · ${live.size} replies running` : ''}`, 'is-live']
        : snapFresh ? [`✓ ${fmt(lastSnap.usage.input)}→${fmt(lastSnap.usage.output)}`, `Last reply (${agentName(lastSnap.agentId)}): ${full(lastSnap.usage.input)} in · ${full(lastSnap.usage.output)} out${lastSnap.est ? ` (estimated ${full(lastSnap.est)} out while streaming)` : ''}`, 'is-snap']
          : ['○ idle', 'Nothing streaming right now. Live token count shows here while a reply streams.', ''],
      chat: [cs ? `chat ${fmt(tot(cs))}` : 'chat –', cs ? `This chat: ${full(cs.i)} in (${full(cs.c || 0)} cached) · ${full(cs.o)} out · ${cs.r} replies` : 'This chat has no recorded replies yet', ''],
      today: [`today ${fmt(tot(today))}`, `Today: ${full(today.i)} in · ${full(today.o)} out · ${today.r || 0} replies${Object.keys(prefs.budgets).length ? ' · budgets set' : ''}`, budgetState() ? `b-${budgetState()}` : ''],
      split: [null, `Today: ${engineLabel('claude')} ${full(tot(sp.claude))} · ${engineLabel('codex')} ${full(tot(sp.codex))}${tot(sp.other) ? ` · other ${full(tot(sp.other))}` : ''}`, ''],
      cache: [`⚡${pct(today.c || 0, today.i || 0)}%`, `Cache hits today: ${full(today.c || 0)} of ${full(today.i || 0)} input tokens came from the prompt cache (cheaper and faster)`, ''],
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
  let painted = '';
  function paint(force) {
    if (!strip) return;
    const r = readings();
    // the pill: today's total, rainbow while live, budget colors
    const today = tot(r._today);
    pill.querySelector('.mp-num').textContent = live.size ? fmt([...live.values()].reduce((s, l) => s + estimate(l), 0)) : fmt(today);
    pill.classList.toggle('is-live', live.size > 0);
    pill.classList.toggle('b-warn', budgetState() === 'warn');
    pill.classList.toggle('b-over', budgetState() === 'over');
    const budgetTotal = Object.values(prefs.budgets).reduce((s, b) => s + (b || 0), 0);
    pill.style.setProperty('--fill', `${Math.min(100, budgetTotal ? pct(today, budgetTotal) : pct(r._ctx, r._win))}%`);
    pill.title = `${live.size ? 'Streaming now · ' : ''}Tokens today: ${full(today)}${budgetTotal ? ` of ${fmt(budgetTotal)} budget` : ''} · click for the dashboard · right-click for options`;
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
  function tick() {
    if (ticking) return;
    ticking = setTimeout(() => { ticking = 0; paint(); }, 120);
  }

  // ---------- per-message badges and per-chat totals ----------
  // The token line under a reply (native.js calls this). Full: in · out · cached % · time; compact: total.
  function badge(m) {
    const u = m?.usage;
    if (!u) return null;
    const secs = m.ms ? m.ms / 1000 : 0;
    const title = [`${full(u.input)} input tokens${u.cached ? ` (${full(u.cached)} from cache, ${pct(u.cached, u.input)}%)` : ''}`,
      u.cacheWrite ? `${full(u.cacheWrite)} written to cache` : null,
      `${full(u.output)} output tokens`, secs ? `${secs.toFixed(1)} s · ${Math.round(u.output / Math.max(secs, 0.1))} tokens/s` : null,
      u.cost ? `≈ ${money(u.cost)} at API prices (free on your subscription)` : null].filter(Boolean).join('\n');
    if (prefs.badges === 'off') return el('span', { text: `${fmt(u.input)} in · ${fmt(u.output)} out${secs ? ` · ${secs.toFixed(1)}s` : ''}` });
    if (prefs.badges === 'compact') return el('span', { class: 'meter-badge compact', title, text: `${fmt(u.input + u.output)} tok` });
    return el('span', { class: 'meter-badge', title },
      el('span', { text: `${fmt(u.input)} in` }), ' · ', el('span', { text: `${fmt(u.output)} out` }),
      u.cached ? el('span', { class: 'mb-cache', text: ` · ⚡${pct(u.cached, u.input)}%` }) : null,
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
    for (const row of root.querySelectorAll('.item')) {
      const has = row.querySelector('.item-tok');
      if (!prefs.panelTotals) { has?.remove(); continue; }
      const c = chatStat(row.dataset.key);
      if (!c) { has?.remove(); continue; }
      const text = fmt(tot(c));
      const title = `${full(tot(c))} tokens · ${c.r} replies · context now ${fmt(c.ctx || 0)}`;
      if (has) { if (has.textContent !== text) { has.textContent = text; has.title = title; } continue; }
      row.append(el('span', { class: 'item-tok', text, title }));
    }
  }

  // ---------- canvas charts (no libraries) ----------
  const probe = el('span', { style: { display: 'none' } });
  function color(css) {
    if (!probe.isConnected) document.body.append(probe);
    probe.style.color = '';
    probe.style.color = css;
    return getComputedStyle(probe).color || '#888';
  }
  function canvas(w, h, cls = 'mt-chart') {
    const c = el('canvas', { class: cls });
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px`;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    return [c, g];
  }
  // Stacked bars: series = [{ color, values }], labels under every Nth bar; hover shows a tooltip.
  // as wide as the dashboard allows
  const chartW = () => Math.round(Math.max(300, Math.min(816, window.innerWidth * 0.94 - 48)));
  function bars(labels, series, { w = chartW(), h = 150, tips = [] } = {}) {
    const [c, g] = canvas(w, h);
    const n = labels.length;
    const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const padB = 18; const padT = 8; const gap = n > 40 ? 1 : 3;
    const bw = Math.max(1, (w - gap * (n - 1)) / n);
    const muted = color('var(--muted)');
    g.font = '10px system-ui, sans-serif'; g.fillStyle = muted; g.textAlign = 'center';
    const every = Math.ceil(n / 10);
    labels.forEach((lab, i) => {
      let y = h - padB;
      for (const s of series) {
        const v = s.values[i] || 0;
        if (!v) continue;
        const bh = (v / max) * (h - padB - padT);
        g.fillStyle = color(s.color);
        g.fillRect(i * (bw + gap), y - bh, bw, bh);
        y -= bh;
      }
      if (i % every === 0 || i === n - 1) { g.fillStyle = muted; g.fillText(lab, i * (bw + gap) + bw / 2, h - 4); }
    });
    // the max line
    g.strokeStyle = color('var(--line)'); g.beginPath(); g.moveTo(0, padT + 0.5); g.lineTo(w, padT + 0.5); g.stroke();
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText(fmt(max), w - 2, padT + 10);
    c.addEventListener('mousemove', (e) => {
      const i = Math.floor(e.offsetX / (bw + gap));
      c.title = i >= 0 && i < n ? (tips[i] || `${labels[i]}: ${full(totals[i])} tokens`) : '';
    });
    return c;
  }
  function sparkline(values, { w = 120, h = 26, stroke = 'var(--meter-active)' } = {}) {
    const [c, g] = canvas(w, h, 'mt-spark');
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? w / (values.length - 1) : w;
    g.beginPath();
    values.forEach((v, i) => { const x = i * step; const y = h - 2 - (v / max) * (h - 4); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = color(stroke); g.lineWidth = 1.5; g.stroke();
    g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.globalAlpha = 0.15; g.fillStyle = color(stroke); g.fill();
    return c;
  }
  // A ring gauge (cache %, budget %, context %).
  function ring(p, { size = 46, stroke = 'var(--meter-active)', label = `${Math.round(p)}%` } = {}) {
    const [c, g] = canvas(size, size, 'mt-ring');
    const r = size / 2 - 4;
    g.lineWidth = 5; g.strokeStyle = color('var(--line)');
    g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = color(stroke); g.lineCap = 'round';
    g.beginPath(); g.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + (Math.min(100, p) / 100) * Math.PI * 2); g.stroke();
    g.fillStyle = color('var(--text)'); g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, size / 2, size / 2 + 1);
    return c;
  }

  // ---------- dashboard ----------
  const TABS = [
    { id: 'overview', label: 'Overview' }, { id: 'agents', label: 'Agents' }, { id: 'models', label: 'Models' },
    { id: 'tools', label: 'Tools' }, { id: 'chats', label: 'Chats' }, { id: 'features', label: 'Features' },
    { id: 'budgets', label: 'Budgets & alerts' }, { id: 'export', label: 'Export' },
  ];
  let dlg = null;
  async function dashboard(tab) {
    await refresh();
    dlg?.close();
    let range = store.get('meter.range', 'week');
    let current = TABS.some((t) => t.id === tab) ? tab : store.get('meter.tab', 'overview');
    const rangeBar = el('div', { class: 'mt-seg' }, Object.keys(RANGES).map((r) => el('button', { type: 'button', text: { today: 'Today', week: '7 days', month: '30 days', all: 'All' }[r], dataset: { r, feature: `Range ${r}` } })));
    const tabBar = el('div', { class: 'mt-tabs' }, TABS.map((t) => el('button', { type: 'button', text: t.label, dataset: { t: t.id, feature: `Tab ${t.label}` } })));
    const kpis = el('div', { class: 'mt-kpis' });
    const pane = el('div', { class: 'mt-pane' });
    const close = el('button', { type: 'button', class: 'ghost mt-x', text: '×', title: 'Close (Esc)' });
    dlg = el('dialog', { class: 'ui-modal wide meter-dlg' },
      el('div', { class: 'mt-head' }, el('h2', { text: 'Tokens & usage' }), rangeBar, el('span', { class: 'spacer' }), close),
      kpis, tabBar, pane);
    const draw = () => {
      for (const b of rangeBar.children) b.classList.toggle('on', b.dataset.r === range);
      for (const b of tabBar.children) b.classList.toggle('on', b.dataset.t === current);
      kpis.replaceChildren(...kpiTiles(rangeDays(range)));
      pane.replaceChildren(...[].concat(PANES[current](rangeDays(range), range)));
    };
    rangeBar.addEventListener('click', (e) => { const r = e.target.closest('button')?.dataset.r; if (r) { range = r; store.set('meter.range', r); draw(); } });
    tabBar.addEventListener('click', (e) => { const t = e.target.closest('button')?.dataset.t; if (t) { current = t; store.set('meter.tab', t); draw(); } });
    close.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { const d = dlg; setTimeout(() => d?.remove(), 0); if (dlg === d) dlg = null; });
    dlg.redraw = draw;
    document.body.append(dlg);
    dlg.tabIndex = -1;
    dlg.showModal();
    dlg.focus(); // not the first range button (its focus ring looked like the selected range)
    draw();
    return dlg;
  }
  function kpi(label, value, sub, extra) {
    return el('div', { class: 'mt-kpi' }, el('span', { class: 'mt-kl', text: label }), el('b', { text: value }), sub ? el('small', { text: sub }) : null, extra || null);
  }
  function kpiTiles(days) {
    const s = sumOf(days);
    const clicks = days.reduce((n, d) => n + (Usage.data?.days?.[d] || 0), 0);
    const series = days.slice(-30).map((d) => tot(sumOf([d])));
    return [
      kpi('Tokens', fmt(tot(s)), `${fmt(s.i)} in · ${fmt(s.o)} out`, days.length > 1 ? sparkline(series, { w: 64, h: 18 }) : null),
      kpi('Cached', `${pct(s.c || 0, s.i || 0)}%`, `${fmt(s.c || 0)} of the input`),
      kpi('Replies', full(s.r || 0), `⌀ ${fmt(s.r ? tot(s) / s.r : 0)} tokens each`),
      kpi('Reply time', s.r && s.ms ? `${(s.ms / s.r / 1000).toFixed(1)} s` : '–', s.ms ? `${Math.round((s.o || 0) / (s.ms / 1000))} out tokens/s` : null),
      kpi('Tool calls', full(s.tools || 0), s.r ? `${((s.tools || 0) / s.r).toFixed(1)} per reply` : null),
      s.cost ? kpi('API value', money(s.cost), 'what it would cost via the API · you pay $0 extra') : null,
      kpi('Feature clicks', full(clicks), typeof Usage !== 'undefined' && days.length === 1 ? `${Usage.dayStats(days[0]).features} features` : `${days.length} day${days.length === 1 ? '' : 's'}`),
    ];
  }
  const legend = (items) => el('div', { class: 'mt-legend' }, items.map(([label, c]) => el('span', {}, el('i', { style: { background: c } }), label)));
  function table(head, rows) {
    return el('table', { class: 'mt-table' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v) => (v instanceof Node ? el('td', {}, v) : el('td', { text: v ?? '' })))))));
  }
  const meterBar = (v, max, c) => el('span', { class: 'mt-bar' }, el('i', { style: { width: `${max ? (v / max) * 100 : 0}%`, background: c || 'var(--meter-active)' } }));
  function dimTable(dim, days, nameOf, colorOf) {
    const rows = Object.entries(by(dim, days)).sort((a, b) => tot(b[1]) - tot(a[1]));
    const max = Math.max(1, ...rows.map(([, t]) => tot(t)));
    if (!rows.length) return el('p', { class: 'hint', text: 'Nothing recorded in this range.' });
    return table(['', 'Tokens', 'In', 'Cached', 'Out', 'Replies', '⌀ / reply', 'Trend'], rows.map(([k, t]) => [
      el('span', { class: 'mt-name' }, el('i', { class: 'mt-dot', style: { background: colorOf?.(k) || 'var(--meter-active)' } }), nameOf(k)),
      el('span', { class: 'mt-tok' }, meterBar(tot(t), max, colorOf?.(k)), fmt(tot(t))),
      fmt(t.i), `${pct(t.c || 0, t.i || 0)}%`, fmt(t.o), full(t.r || 0), fmt(t.r ? tot(t) / t.r : 0),
      sparkline(dayKeys(14).map((d) => tot(stats?.days?.[d]?.[dim]?.[k])), { w: 80, h: 18, stroke: colorOf?.(k) || 'var(--meter-active)' }),
    ]));
  }
  const PANES = {
    overview(days, range) {
      const out = [];
      if (range === 'today') {
        const h = stats?.days?.[dayKey()]?.h || {};
        out.push(el('h4', { text: 'Today by hour' }), bars(Array.from({ length: 24 }, (_, i) => String(i)), [{ color: 'var(--meter-active)', values: Array.from({ length: 24 }, (_, i) => h[i] || 0) }], { h: 130 }));
      } else {
        const ds = range === 'all' ? allDays().slice(-90) : days;
        const parts = ds.map((d) => sumOf([d]));
        out.push(el('h4', { text: range === 'all' ? `By day (last ${ds.length} days with data)` : 'By day' }),
          bars(ds.map((d) => dayLabel(d, { month: 'numeric', day: 'numeric' })), [
            { color: 'var(--meter-info)', values: parts.map((t) => t.c || 0) },
            { color: 'var(--meter-ai)', values: parts.map((t) => (t.i || 0) - (t.c || 0)) },
            { color: 'var(--meter-active)', values: parts.map((t) => t.o || 0) },
          ], { h: 150, tips: ds.map((d, i) => `${dayLabel(d)}: ${full(tot(parts[i]))} tokens · ${full(parts[i].c || 0)} cached · ${full((parts[i].i || 0) - (parts[i].c || 0))} fresh input · ${full(parts[i].o || 0)} out · ${parts[i].r || 0} replies`) }),
          legend([['Cached input', 'var(--meter-info)'], ['Fresh input', 'var(--meter-ai)'], ['Output', 'var(--meter-active)']]));
      }
      const sp = split(days); const sum = tot(sp.claude) + tot(sp.codex) + tot(sp.other) || 1;
      out.push(el('h4', { text: 'Claude vs Astra' }), el('div', { class: 'mt-split' },
        ['claude', 'codex', 'other'].filter((e) => tot(sp[e])).map((e) => el('i', { class: `e-${e}`, style: { flex: tot(sp[e]) / sum }, title: `${engineLabel(e)}: ${full(tot(sp[e]))} tokens · ${sp[e].r || 0} replies`, text: `${engineLabel(e)} ${fmt(tot(sp[e]))}` }))));
      const s = sumOf(days);
      out.push(el('div', { class: 'mt-rings' },
        el('div', {}, ring(pct(s.c || 0, s.i || 0), { stroke: 'var(--meter-info)' }), el('span', { text: 'cache hits' })),
        el('div', {}, ring(pct(s.o || 0, tot(s)), { stroke: 'var(--meter-active)' }), el('span', { text: 'output share' })),
        ...Object.entries(prefs.budgets).filter(([, b]) => b).map(([a, b]) => el('div', {}, ring(pct(tot(by('a', [dayKey()])[a]), b), { stroke: budgetState(a) === 'over' ? 'var(--meter-over)' : budgetState(a) === 'warn' ? 'var(--meter-warn)' : 'var(--meter-ok)' }), el('span', { text: `${agentName(a)} budget` })))));
      const cs = chatStat(activeChatId());
      if (cs) {
        const win = windowFor(activeAgentId(), activeChatId());
        out.push(el('h4', { text: 'This chat' }), el('div', { class: 'mt-chatline' },
          ring(pct(cs.ctx || 0, win), { stroke: (cs.ctx || 0) > win * 0.55 ? 'var(--meter-over)' : 'var(--meter-ai)', label: fmt(cs.ctx || 0) }),
          el('span', { text: `${full(tot(cs))} tokens over ${cs.r} replies · context now ${full(cs.ctx || 0)} of ${fmt(win)} · peak ${fmt(cs.peak || 0)}` }),
          el('button', { type: 'button', class: 'ghost small', text: '🗜 Compact', title: 'Summarize the conversation so each message sends less (the chat keeps every message)', on: { click: () => { if (compact()) dlg?.close(); } } })));
      }
      return out;
    },
    agents: (days) => [el('h4', { text: 'Per agent' }), dimTable('a', days, agentName, agentColor)],
    models: (days) => [el('h4', { text: 'Per model' }), dimTable('m', days, (m) => (m === 'default' ? 'default (agent setting)' : m)),
      el('p', { class: 'hint', text: 'Context windows: 200k by default, 1M for [1m] models. Change one with /meter window <model> <tokens>.' })],
    tools: (days) => [el('h4', { text: 'Per tool (docked directors, chat, second opinions)' }), dimTable('t', days, toolName)],
    chats(days, range) {
      const from = range === 'all' ? 0 : new Date(`${days[0]}T00:00`).getTime();
      const rows = Object.entries(stats?.chats || {}).filter(([, c]) => (c.last || 0) >= from).sort((a, b) => tot(b[1]) - tot(a[1])).slice(0, 40);
      const max = Math.max(1, ...rows.map(([, c]) => tot(c)));
      if (!rows.length) return el('p', { class: 'hint', text: 'No chats with recorded replies in this range.' });
      return [el('h4', { text: 'Most expensive chats (last used in this range)' }), table(['Chat', 'Agent', 'Tokens', 'Replies', 'Context now', 'Peak', ''], rows.map(([id, c]) => {
        const summary = H.chats.find((x) => x.id === id);
        return [summary?.title || '(deleted chat)', agentName(c.a), el('span', { class: 'mt-tok' }, meterBar(tot(c), max, agentColor(c.a)), fmt(tot(c))), full(c.r || 0), fmt(c.ctx || 0), fmt(c.peak || 0),
          summary ? el('button', { type: 'button', class: 'ghost small', text: 'Open', on: { click: () => { dlg?.close(); Native.open(c.a, id); } } }) : ''];
      }))];
    },
    features(days, range) {
      if (typeof Usage === 'undefined' || !Usage.data) return el('p', { class: 'hint', text: 'Feature tracking is not running.' });
      const today = Usage.dayStats();
      const st = Usage.streak();
      const dayClicks = (range === 'all' ? Object.keys(Usage.data.days || {}).sort() : days).map((d) => Usage.data.days?.[d] || 0);
      const out = [
        el('div', { class: 'mt-kpis small' }, kpi('Clicks today', full(today.clicks), `${today.features} different features`), kpi('Streak', `${st.current} day${st.current === 1 ? '' : 's'}`, `best ${st.best}`),
          kpi('Tracked', `${Math.max(1, Math.round(Usage.trackedDays()))} days`, `${Object.keys(Usage.data.items).length} controls seen`),
          kpi('Hidden', String((Usage.data.hidden || []).length), 'Show brings one back')),
      ];
      if (dayClicks.length > 1) out.push(el('h4', { text: 'Clicks per day' }), bars((range === 'all' ? Object.keys(Usage.data.days).sort() : days).map((d) => dayLabel(d, { month: 'numeric', day: 'numeric' })), [{ color: 'var(--meter-active)', values: dayClicks }], { h: 100 }));
      const row = (x, n, extra) => el('div', { class: 'mt-frow' }, el('span', { class: 'mt-fname', text: x.label || x.key.split(' › ').pop(), title: x.key }), el('span', { class: 'mt-farea', text: x.area || x.key.split(' › ')[0] }), el('span', { class: 'mt-fn', text: n }), extra || null);
      const hideBtn = (x) => {
        const hidden = () => (Usage.data.hidden || []).includes(x.key);
        return el('button', { type: 'button', class: 'ghost small', text: hidden() ? 'Show' : 'Hide', title: 'Hide this control everywhere (Show brings it back)', on: { click: (e) => { Usage.setHidden(x.key, !hidden()); e.currentTarget.textContent = hidden() ? 'Show' : 'Hide'; } } });
      };
      out.push(el('div', { class: 'mt-cols' },
        el('div', {}, el('h4', { text: `Used today (${today.top.length})` }), el('div', { class: 'mt-flist' }, today.top.slice(0, 30).map((x) => row({ key: x.key, ...Usage.data.items[x.key] }, `${x.n}×`)))),
        el('div', {}, el('h4', { text: 'Hot (your most used)' }), el('div', { class: 'mt-flist' }, Usage.hot().slice(0, 30).map((x) => row(x, `${x.n}×`))))));
      const cold = Usage.cold();
      if (cold.length) out.push(el('h4', { text: `Cold: not used for 3+ weeks (${cold.length})` }), el('div', { class: 'mt-flist' }, cold.slice(0, 60).map((x) => row(x, timeAgo(x.last), hideBtn(x)))));
      const never = Usage.never();
      const filter = el('input', { type: 'search', placeholder: 'Filter never-used…', class: 'mt-filter' });
      const list = el('div', { class: 'mt-flist' });
      const fill = () => { const q = filter.value.toLowerCase(); list.replaceChildren(...never.filter((x) => !q || x.key.toLowerCase().includes(q)).slice(0, 150).map((x) => row(x, '0', hideBtn(x)))); };
      filter.addEventListener('input', fill); fill();
      out.push(el('div', { class: 'mt-h4row' }, el('h4', { text: `Never used (${never.length})` }), filter,
        el('button', { type: 'button', class: 'ghost small', text: 'Show all hidden', title: 'Bring every hidden control back', on: { click: () => { for (const k of [...(Usage.data.hidden || [])]) Usage.setHidden(k, false); toast('Every hidden control is back', { timeout: 1800 }); dlg?.redraw(); } } })), list);
      out.push(el('h4', { text: 'By area' }), el('div', { class: 'mt-chips' }, Usage.byArea().map(([a, n]) => el('span', { class: 'us-chip', text: `${a} ${n}` }))));
      return out;
    },
    budgets() {
      const natives = H.agents().filter((a) => a.mode === 'native');
      const today = by('a', [dayKey()]);
      const alerts = el('input', { type: 'checkbox', checked: prefs.alerts });
      const warn = el('input', { type: 'number', min: 10, max: 100, step: 5, value: prefs.warnPct });
      const longCtx = el('input', { type: 'number', min: 0, step: 5000, value: prefs.longCtx, placeholder: '0 = off' });
      const inputs = new Map();
      const rows = natives.map((a) => {
        const input = el('input', { type: 'number', min: 0, step: 10000, value: prefs.budgets[a.id] || '', placeholder: 'no budget' });
        inputs.set(a.id, input);
        const used = tot(today[a.id]); const b = prefs.budgets[a.id];
        return el('div', { class: 'mt-brow' }, el('span', { class: 'mt-name' }, el('i', { class: 'mt-dot', style: { background: a.color || 'var(--accent)' } }), a.name),
          el('span', { class: 'hint', text: `today ${fmt(used)}${b ? ` · ${pct(used, b)}%` : ''}` }), b ? meterBar(Math.min(used, b), b, budgetState(a.id) === 'over' ? 'var(--meter-over)' : budgetState(a.id) === 'warn' ? 'var(--meter-warn)' : 'var(--meter-ok)') : el('span'), input);
      });
      const saveBtn = el('button', { type: 'button', class: 'primary small', text: 'Save', on: { click: () => {
        for (const [id, input] of inputs) { const v = Number(input.value); if (v > 0) prefs.budgets[id] = v; else delete prefs.budgets[id]; }
        prefs.alerts = alerts.checked; prefs.warnPct = Math.min(100, Math.max(10, Number(warn.value) || 80)); prefs.longCtx = Math.max(0, Number(longCtx.value) || 0);
        savePrefs(); alerted.clear(); checkBudgets(); paint(true); toast('Budgets saved', { timeout: 1500 }); dlg?.redraw();
      } } });
      return [
        el('p', { class: 'hint', text: 'Optional daily token budgets per agent. Nothing is ever blocked: the meter turns orange near a budget and red past it, and with alerts on you get one notification at each step. Budgets reset at midnight.' }),
        el('div', { class: 'mt-budgets' }, rows),
        el('label', { class: 'check' }, alerts, ' Notify me near and over a budget'),
        el('label', { class: 'mt-inline' }, 'Warn at', warn, '% of the budget'),
        el('label', { class: 'mt-inline' }, 'Long-context warning when a message sends over', longCtx, 'tokens (0 = off)'),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), saveBtn),
      ];
    },
    export() {
      return [
        el('p', { class: 'hint', text: 'Your token history per day, agent, model and tool. Everything stays on this PC (data/kv/token-stats.json).' }),
        el('div', { class: 'mt-actions' },
          el('button', { type: 'button', class: 'ghost', text: 'Save as CSV…', on: { click: () => exportUsage('csv') } }),
          el('button', { type: 'button', class: 'ghost', text: 'Save as JSON…', on: { click: () => exportUsage('json') } }),
          el('button', { type: 'button', class: 'ghost', text: 'Copy as Markdown table', on: { click: () => exportUsage('md') } }),
          el('button', { type: 'button', class: 'ghost', text: 'Rebuild from chats', title: 'Recount everything from the replies your chats recorded', on: { click: async () => { await rebuild(); dlg?.redraw(); } } })),
        el('p', { class: 'hint', text: `Tracking since ${stats?.since ? new Date(stats.since).toLocaleDateString() : 'now'} · ${Object.keys(stats?.chats || {}).length} chats · ${allDays().length} days with replies. Estimates while streaming use ${Object.entries(prefs.calib).map(([e, v]) => `${v} characters/token (${engineLabel(e)})`).join(', ') || '4 characters per token'}.` }),
      ];
    },
  };

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
    R({ name: 'tokens', aliases: ['tok'], args: '[today|week|month|all|chat]', desc: 'Token totals (this chat, today, week, month or all time)', complete: () => [...RANGE_ARGS, { value: 'chat' }],
      run: async (args) => {
        await refresh();
        if (/^c/i.test(args)) return PANE_TEXT.chat();
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
    R({ name: 'context', aliases: ['ctx'], args: '[compact]', desc: 'How full this chat\'s context is; /ctx compact compacts it', complete: () => [{ value: 'compact' }],
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
      return `Cache hits (${r}): **${pct(s.c || 0, s.i || 0)}%** · ${full(s.c || 0)} of ${full(s.i || 0)} input tokens${s.w ? ` · ${full(s.w)} written to cache` : ''}`;
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
    R({ name: 'live', desc: 'Replies streaming right now with their estimated tokens', run: () => (live.size ? [...live.entries()].map(([id, l]) => `- ${agentName(l.agentId)} · ${H.chats.find((c) => c.id === id)?.title || id} · ≈${fmt(estimate(l))} out so far · ${l.tools} tool calls · ${Math.round((Date.now() - l.started) / 1000)} s`).join('\n') : 'Nothing is streaming.') });
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
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') { e.preventDefault(); if (dlg) dlg.close(); else dashboard(); Usage.key?.('Ctrl+Shift+U', 'Token dashboard'); }
    });
    for (const [label, fn] of [
      ['Token dashboard', () => dashboard()],
      ['Meter: strip / rail pill', () => setMode(prefs.mode === 'strip' ? 'pill' : 'strip')],
      ['Meter: choose fields', chooseFields],
      ['Daily token budgets & alerts', () => dashboard('budgets')],
      ['Most expensive chats', () => dashboard('chats')],
      ['Features used today / never used', () => dashboard('features')],
      ['Export token usage (CSV)', () => exportUsage('csv')],
      ['Export token usage (JSON)', () => exportUsage('json')],
      ['Compact this chat\'s context', () => compact()],
    ]) AppUI.addAction?.(label, fn, label === 'Token dashboard' ? 'Ctrl+Shift+U' : '');
    // the context fill and "this chat" follow whichever chat is on screen
    let seen = '';
    setInterval(() => { const s = `${H.activeId}|${activeChatId()}`; if (s !== seen) { seen = s; paint(); } }, 700);
    // midnight: "today" starts over
    let day = dayKey();
    setInterval(() => { if (dayKey() !== day) { day = dayKey(); alerted.clear(); refresh(); } }, 60000);
    await refresh();
  }

  return {
    init, ingest, refresh, dashboard, badge, chatTotal, compact, exportUsage, setMode, estimateText,
    get stats() { return stats; }, get prefs() { return prefs; }, get live() { return live; },
    _test: { fmt, spark, parseTokens, sumOf, by, dayKeys, csv, markdown, readings },
  };
})();
