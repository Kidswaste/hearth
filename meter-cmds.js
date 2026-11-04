// The token meter's chat commands (round 119, meterlazy119: moved out of meter.js, so the first screen doesn't parse
// them): /usage, /meter, /budget, /stats-today, /cache, /top-chats, /features… (area Meter). Lazy group 'metercmds': it
// loads in an idle moment after the first screen, or the first time one of these commands is used (its stand-ins are in
// the "/" menu, /help and Ctrl/⌘+K from the start). The code is the same as before; the numbers and helpers it reads come
// from meter.js (Meter.stats, Meter.prefs, Meter._dash).
// /tokens and /context stay registered by meter.js itself (Meter.init, with `override`, at the same moment as before, so
// they still replace the chat stream's simpler ones): their run bodies are here (MeterCmds.tokens / .context), and the
// first /tokens or /context loads this group, then runs them.
const MeterCmds = (() => {
  const { DAY, FIELDS, savePrefs, resetPrefs, fmt, full, pct, cacheSaved, money, spark, dayKey, dayKeys, dayLabel, tot, agentName, toolName, by, sumOf, allDays, rangeDays, split, engineOf, engineLabel, activeAgentId, activeChatId, chatStat, windowFor, refresh, alerted, checkBudgets, compact, paint, setMode, chooseFields, decoratePanel, dashboard, TABS, weekdays, exportUsage, rebuild, report, line, estimate, estimateText, cpt, session, parseTokens, RANGE_ARGS, AGENT_ARGS } = Meter._dash;
  const live = Meter.live;
  const pickRange = (args) => { const a = (args || '').toLowerCase(); return a.startsWith('w') ? 'week' : a.startsWith('m') ? 'month' : a.startsWith('a') || a.startsWith('l') ? 'all' : a.startsWith('t') || a.startsWith('d') ? 'today' : null; };
  const agentArg = (q) => { const s = String(q || '').toLowerCase().trim(); return H.agents().find((a) => a.mode === 'native' && (a.id.toLowerCase() === s || a.name.toLowerCase() === s)) || H.agents().find((a) => a.mode === 'native' && a.name.toLowerCase().startsWith(s)); };
  function dimReport(dim, range, nameOf) {
    const rows = Object.entries(by(dim, rangeDays(range))).sort((a, b) => tot(b[1]) - tot(a[1]));
    if (!rows.length) return 'Nothing recorded in this range.';
    return rows.map(([k, t]) => `- ${line(nameOf(k), t)}`).join('\n');
  }
  const featureList = (items, n = 20, show = (x) => `${x.n}×`) => items.slice(0, n).map((x) => `- ${x.label || x.key} · ${x.area || ''} · ${show(x)}`).join('\n');

  // ---------- chat commands ----------
  const R = (def) => Commands.register({ area: 'Meter', ...def });
  R({ name: 'usage', aliases: ['dashboard', 'token-usage'], args: '[tab]', desc: 'Open the token & usage dashboard (overview, agents, models, tools, chats, features, budgets, export)',
    complete: (a) => TABS.filter((t) => t.id.startsWith(a.toLowerCase())).map((t) => ({ value: t.id, hint: t.label })),
    run: (args) => { dashboard(TABS.find((t) => t.id.startsWith((args || '').toLowerCase()) && args)?.id); } });
  R({ name: 'meter', args: '[strip|pill|off|fields|window <model> <tokens>|reset]', desc: 'Show the meter as a strip, a rail pill or hide it; choose its fields',
    complete: () => ['strip', 'pill', 'off', 'toggle', 'fields', 'window', 'reset'].map((value) => ({ value })),
    run: (args) => {
      const [cmd, ...rest] = (args || 'toggle').split(/\s+/);
      if (cmd === 'fields') { chooseFields(); return; }
      if (cmd === 'reset') { resetPrefs(); return 'Meter back to its defaults (budgets kept).'; }
      if (cmd === 'window') {
        const n = parseTokens(rest.at(-1)); const model = rest.slice(0, -1).join(' ');
        if (!model || !n) return 'Usage: /meter window <model> <tokens>, e.g. /meter window opus 1m';
        Meter.prefs.windows[model] = n; savePrefs(); paint(true); return `Context window for ${model}: ${fmt(n)} tokens.`;
      }
      const mode = setMode(['strip', 'pill', 'off'].includes(cmd) ? cmd : 'toggle');
      return `Meter: ${mode === 'strip' ? 'strip at the bottom' : mode === 'pill' ? 'pill in the rail' : 'hidden (/meter strip brings it back)'}.`;
    } });
  R({ name: 'meter-field', args: '<field> [on|off]', desc: 'Show or hide one meter strip field', complete: (a) => FIELDS.filter((f) => f.id.startsWith(a.split(' ')[0].toLowerCase())).map((f) => ({ value: f.id, hint: f.label })),
    run: (args) => {
      const [id, onoff] = args.split(/\s+/);
      if (!FIELDS.some((f) => f.id === id)) return `Fields: ${FIELDS.map((f) => `\`${f.id}\` ${f.label}`).join(' · ')}`;
      const on = onoff ? onoff === 'on' : !Meter.prefs.fields.includes(id);
      Meter.prefs.fields = FIELDS.map((f) => f.id).filter((f) => (f === id ? on : Meter.prefs.fields.includes(f)));
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
      if (/^(off|none|0)$/i.test(amount)) { delete Meter.prefs.budgets[agent.id]; savePrefs(); paint(true); return `No budget for ${agent.name}.`; }
      const n = parseTokens(amount);
      if (!n) return 'Give an amount like 300k or 1.5m (or off).';
      Meter.prefs.budgets[agent.id] = n;
      if (!Meter.prefs.alerts) Meter.prefs.alerts = true;
      savePrefs(); alerted.clear(); checkBudgets(); paint(true);
      return `${agent.name}: daily budget ${fmt(n)} tokens (alerts on, warning at ${Meter.prefs.warnPct}%). Today so far: ${fmt(tot(by('a', [dayKey()])[agent.id]))}.`;
    } });
  R({ name: 'budgets', desc: 'Every daily token budget and how much is used today', run: async () => { await refresh(); return budgetsText(); } });
  R({ name: 'budget-warn', args: '<percent>', desc: 'At what % of a budget the meter warns (default 80)', run: (args) => { const n = Number(String(args).replace('%', '')); if (!(n >= 10 && n <= 100)) return 'Give a percent between 10 and 100.'; Meter.prefs.warnPct = n; savePrefs(); paint(true); return `Budget warning at ${n}%.`; } });
  R({ name: 'alerts', args: '[on|off]', desc: 'Budget notifications on or off', complete: () => [{ value: 'on' }, { value: 'off' }],
    run: (args) => { Meter.prefs.alerts = args ? /^on|yes|1/i.test(args) : !Meter.prefs.alerts; savePrefs(); return `Budget alerts ${Meter.prefs.alerts ? 'on' : 'off'}.`; } });
  R({ name: 'long-warn', aliases: ['context-warn'], args: '<tokens|off>', desc: 'Warn when a chat sends more than this per message (e.g. 60k)',
    run: (args) => { if (/^(off|0)$/i.test(args)) { Meter.prefs.longCtx = 0; savePrefs(); return 'Long-context warning off.'; } const n = parseTokens(args); if (!n) return `Long-context warning is ${Meter.prefs.longCtx ? fmt(Meter.prefs.longCtx) : 'off'}. Set it with /long-warn 60k.`; Meter.prefs.longCtx = n; savePrefs(); return `Long-context warning at ${fmt(n)} tokens per message.`; } });
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
  R({ name: 'lifetime', aliases: ['all-time'], desc: 'All-time token totals', run: async () => { await refresh(); return `${report('all')}\nTracking since ${new Date(Meter.stats?.since || Date.now()).toLocaleDateString()}.`; } });
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
  R({ name: 'hourly', desc: 'Today by hour as a sparkline', run: async () => { await refresh(); const h = Meter.stats?.days?.[dayKey()]?.h || {}; const v = Array.from({ length: 24 }, (_, i) => h[i] || 0); const top = v.indexOf(Math.max(...v)); return `\`${spark(v)}\` 0h → 23h${Math.max(...v) ? ` · busiest ${top}:00 (${fmt(v[top])})` : ''}`; } });
  R({ name: 'daily', args: '[days]', desc: 'Tokens per day for the last N days (default 14)', run: async (args) => {
    await refresh();
    const n = Math.min(90, Math.max(2, Number(args) || 14)); const days = dayKeys(n);
    return `\`${spark(days.map((d) => tot(sumOf([d]))))}\` last ${n} days\n${days.slice(-7).map((d) => `- ${dayLabel(d)}: ${fmt(tot(sumOf([d])))}`).join('\n')}`;
  } });
  R({ name: 'top-chats', aliases: ['expensive'], args: '[n]', desc: 'The chats that used the most tokens', run: async (args) => {
    await refresh();
    const rows = Object.entries(Meter.stats?.chats || {}).sort((a, b) => tot(b[1]) - tot(a[1])).slice(0, Math.min(30, Number(args) || 8));
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
    const hours = Array(24).fill(0); for (const d of days) for (const [h, v] of Object.entries(Meter.stats.days[d].h || {})) hours[h] += v;
    const hh = hours.indexOf(Math.max(...hours));
    return `Busiest day: **${dayLabel(best)}** (${fmt(tot(sumOf([best])))}) · busiest hour overall: **${hh}:00** \`${spark(hours)}\``;
  } });
  R({ name: 'streaming', aliases: ['live-tokens'], desc: 'Replies streaming right now with their estimated tokens', run: () => (live.size ? [...live.entries()].map(([id, l]) => `- ${agentName(l.agentId)} · ${H.chats.find((c) => c.id === id)?.title || id} · ≈${fmt(estimate(l))} out so far · ${l.tools} tool calls · ${Math.round((Date.now() - l.started) / 1000)} s`).join('\n') : 'Nothing is streaming.') });
  R({ name: 'estimate', aliases: ['count-tokens'], args: '[text]', desc: 'Estimate the tokens of some text (or of your draft)', run: (args, ctx) => {
    const text = args || ctx.input?.value || '';
    if (!text) return 'Type /estimate followed by text, or write a draft first.';
    return `≈ **${full(estimateText(text, ctx.agentId))}** tokens (${full(text.length)} characters at ${cpt(ctx.agentId)} per token${Meter.prefs.calib[engineOf(ctx.agentId)] ? ', learned from your replies' : ''}).`;
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
    run: (args) => { Meter.prefs.badges = ['full', 'compact', 'off'].includes(args) ? args : Meter.prefs.badges === 'full' ? 'compact' : 'full'; savePrefs(); const a = activeAgentId(); if (a) Native.refresh(a, { keepScroll: true }); toast(`Reply token badges: ${Meter.prefs.badges}`, { timeout: 1600 }); } });
  R({ name: 'panel-totals', args: '[on|off]', desc: 'Show tokens per chat in the chats panel', complete: () => [{ value: 'on' }, { value: 'off' }],
    run: (args) => { Meter.prefs.panelTotals = args ? /^on|yes|1/i.test(args) : !Meter.prefs.panelTotals; savePrefs(); decoratePanel(); return `Chat totals in the panel: ${Meter.prefs.panelTotals ? 'on' : 'off'}.`; } });
  R({ name: 'export-usage', aliases: ['tokens-export'], args: '[csv|json|md]', desc: 'Save your token history as CSV / JSON, or copy a Markdown table', complete: () => ['csv', 'json', 'md'].map((value) => ({ value })),
    run: (args) => exportUsage(['json', 'md'].includes(args) ? args : 'csv') });
  R({ name: 'usage-rebuild', desc: 'Recount the token stats from every chat\'s recorded replies', run: async () => { await rebuild(); return `Rebuilt: ${allDays().length} days, ${Object.keys(Meter.stats?.chats || {}).length} chats.`; } });
  R({ name: 'session', desc: 'Tokens since Hearth started', run: () => `${line(`Since ${new Date(session.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, session)}` });
  R({ name: 'budget-left', aliases: ['left'], desc: 'Tokens left today in each budget', run: async () => {
    await refresh();
    const today = by('a', [dayKey()]);
    const rows = Object.entries(Meter.prefs.budgets).filter(([, b]) => b).map(([a, b]) => { const left = b - tot(today[a]); return `- ${agentName(a)}: ${left >= 0 ? `**${fmt(left)}** left` : `**${fmt(-left)}** over`} of ${fmt(b)}`; });
    return rows.join('\n') || 'No budgets set. Try /budget Claude 300k.';
  } });
  R({ name: 'weekdays', desc: 'Your average tokens per weekday', run: async () => { await refresh(); const wd = weekdays(); return `\`${spark(wd.map((x) => x.avg))}\` ${wd.map((x) => `${x.label} ${fmt(x.avg)}`).join(' · ')}`; } });
  R({ name: 'calibration', desc: 'How live estimates turn characters into tokens (learned per engine)', run: () => `Characters per token: ${['claude', 'codex'].map((e) => `${engineLabel(e)} ${Meter.prefs.calib[e] || '4 (default)'}`).join(' · ')}. Learned from streamed replies, used for the live meter and /estimate.` });
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
    const rows = Object.entries(Meter.prefs.budgets).filter(([, b]) => b).map(([a, b]) => `- ${agentName(a)}: ${fmt(tot(today[a]))} of ${fmt(b)} (${pct(tot(today[a]), b)}%)`);
    return rows.length ? `${rows.join('\n')}\nAlerts ${Meter.prefs.alerts ? 'on' : 'off'} · warning at ${Meter.prefs.warnPct}%` : 'No budgets. Set one with /budget Claude 300k (or in the dashboard → Budgets & alerts).';
  }
  // /tokens and /context (meter.js registers them)
  async function tokens(args) {
    await refresh();
    if (/^chat/i.test(args)) return PANE_TEXT.chat();
    const word = args.split(/\s+/)[0];
    const agent = word && !['today', 'week', 'month', 'all'].includes(word.toLowerCase()) ? agentArg(word) : null;
    if (agent) {
      const r = pickRange(args.split(/\s+/)[1]) || 'week';
      return `${line(`${agent.name}, ${r === 'today' ? 'today' : r === 'all' ? 'all time' : `last ${rangeDays(r).length} days`}`, by('a', rangeDays(r))[agent.id] || {})}\n\`${spark(dayKeys(14).map((d) => tot(Meter.stats?.days?.[d]?.a?.[agent.id])))}\` last 14 days`;
    }
    return report(pickRange(args) || 'today');
  }
  async function context(args, ctx) {
    await refresh();
    if (/^compact/i.test(args)) { compact(ctx.agentId); return; }
    const c = chatStat(ctx.chatId);
    if (!c) return 'This chat has no recorded replies yet.';
    const win = windowFor(ctx.agentId, ctx.chatId);
    const p = pct(c.ctx || 0, win);
    return `Context: **${full(c.ctx || 0)}** tokens per message (${p}% of ${fmt(win)}) \`${'█'.repeat(Math.round(p / 10))}${'░'.repeat(10 - Math.round(p / 10))}\` · peak ${fmt(c.peak || 0)}.${p >= 30 ? ' Consider /ctx compact.' : ''}`;
  }
  return { tokens, context };
})();
