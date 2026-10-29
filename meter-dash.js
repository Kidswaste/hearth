// The token meter's dashboard (round 83, firstscreen83: moved out of meter.js, so the first screen doesn't parse it): the
// Usage window's tabs and panes, its canvas charts (no libraries) and the Codex account card. meter.js keeps
// Meter.dashboard() and loads this file the first time the dashboard opens, or in an idle moment after the first
// screen (lazy group 'meterdash'). The code is the same as before; the numbers and helpers it reads come from meter.js
// (Meter.stats, Meter.prefs, Meter._dash).
const MeterDash = (() => {
  const { savePrefs, fmt, full, pct, cacheSaved, money, dayKey, dayKeys, dayLabel, tot, agentName, agentColor, toolName, by, sumOf, allDays, RANGES, rangeDays, split, engineLabel, activeAgentId, activeChatId, chatStat, windowFor, refresh, alerted, checkBudgets, budgetState, compact, paint, TABS, weekdays, exportUsage, rebuild, report } = Meter._dash;
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


  // (round 49, appcalm) five tabs in sight, the rare ones (and the copy) behind More ▾
  const RARE_TABS = ['tools', 'features', 'export'];
  let dlg = null;
  function accountCard(host, result) {
    host.replaceChildren(el('h3', { text: 'Codex account limits' }),
      el('p', { class: 'hint', text: 'From the Codex account signed in on this computer. Shared across its Codex sessions and devices; separate from the Hearth traffic below. Claude limits are not available here.' }));
    if (!result?.available) { host.append(el('p', { text: result?.error || 'Account limits are unavailable for this sign-in. Missing limits do not mean zero usage.' })); return; }
    for (const b of result.buckets) {
      for (const w of b.windows) {
        const mins = w.minutes;
        const label = mins == null ? `${w.key} window` : mins % 1440 === 0 ? `${mins / 1440}-day window` : mins % 60 === 0 ? `${mins / 60}-hour window` : `${mins}-minute window`;
        const reset = w.resetsAt ? `Resets ${new Date(w.resetsAt).toLocaleString()}` : 'Reset time unavailable';
        host.append(el('div', { class: 'mt-account-row' },
          el('div', {}, el('strong', { text: `${b.name} · ${label}` }), el('span', { text: `${w.remaining}% remaining · ${w.used}% used` })),
          el('progress', { attrs: { max: '100', value: String(w.used), 'aria-label': `${b.name} ${label}: ${w.used}% used` } }),
          el('small', { text: reset })));
      }
    }
    if (result.ordinaryUsageAllowed === false) host.append(el('p', { text: 'The account currently reports that ordinary included usage is unavailable.' }));
    host.append(el('small', { class: 'hint', text: `Checked ${new Date(result.checkedAt).toLocaleTimeString()}. Reopen to refresh (at most once a minute).` }));
  }
  async function dashboard(tab) {
    await refresh();
    dlg?.close();
    let range = store.get('meter.range', 'week');
    let current = TABS.some((t) => t.id === tab) ? tab : store.get('meter.tab', 'overview');
    const rangeBar = el('div', { class: 'mt-seg' }, Object.keys(RANGES).map((r) => el('button', { type: 'button', text: { today: 'Today', week: '7 days', month: '30 days', all: 'All' }[r], dataset: { r, feature: `Range ${r}` } })));
    const tabBar = el('div', { class: 'mt-tabs' }, TABS.map((t) => el('button', { type: 'button', text: t.label, hidden: RARE_TABS.includes(t.id), dataset: { t: t.id, feature: `Tab ${t.label}` } })));
    const moreTab = el('button', { type: 'button', class: 'mt-more', text: 'More ▾', title: 'Tokens per tool, features you used, export, a copy of this range', dataset: { feature: 'Tab More' } });
    tabBar.append(moreTab);
    const kpis = el('div', { class: 'mt-kpis' });
    const account = el('section', { class: 'mt-account' }, el('h3', { text: 'Usage left' }), el('p', { class: 'hint', text: 'Checking…' }));
    const pane = el('div', { class: 'mt-pane' });
    const close = el('button', { type: 'button', class: 'ghost mt-x', text: '×', title: 'Close (Esc)' });
    // (round 49, appcalm) the copy waits in More ▾ (and the right-click); the traffic note is one line, its words on the pointer
    moreTab.addEventListener('click', () => {
      const r = moreTab.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [...TABS.filter((t) => RARE_TABS.includes(t.id)).map((t) => ({ label: t.label, checked: current === t.id, action: () => { current = t.id; store.set('meter.tab', t.id); draw(); } })), '-',
        { label: 'Copy a summary of this range', tip: 'A Markdown table of this range, ready to paste', action: () => copyText(report(range), 'Usage summary') }]);
    });
    const TRAFFIC = 'Each model call counts its input again, including cached history and tool results. Output includes reasoning and tool calls. These totals are not your subscription allowance or bill. Historical records are preserved.';
    dlg = el('dialog', { class: 'ui-modal wide meter-dlg' },
      el('div', { class: 'mt-head' }, el('h2', { text: 'Usage' }), rangeBar, el('span', { class: 'spacer' }), close),
      account,
      el('p', { class: 'mt-traffic-note hint', title: TRAFFIC, text: 'Hearth\'s token traffic below: not your plan\'s allowance or bill ⓘ' }),
      kpis, tabBar, pane);
    const draw = () => {
      for (const b of rangeBar.children) b.classList.toggle('on', b.dataset.r === range);
      for (const b of tabBar.children) if (b.dataset.t) b.classList.toggle('on', b.dataset.t === current);
      const rare = RARE_TABS.includes(current);
      moreTab.classList.toggle('on', rare);
      const mt = rare ? `${TABS.find((t) => t.id === current).label} ▾` : 'More ▾';
      if (moreTab.textContent !== mt) moreTab.textContent = mt;
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
    // (round 48, usagelimits) one card per AI with what's left of its plan (usagelimits.js, a lazy group); the Codex card before it loads
    const codexOnly = () => { if (window.hub.getCodexUsage) window.hub.getCodexUsage().then(r => { if (account.isConnected) accountCard(account, r); }).catch(() => { if (account.isConnected) accountCard(account, null); }); else accountCard(account, null); };
    (window.UsageLimits || !window.Lazy ? Promise.resolve() : Lazy.load('usagelimits').catch(() => {})).then(() => { if (!account.isConnected) return; if (window.UsageLimits) UsageLimits.paint(account); else codexOnly(); });
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
      kpi('Token traffic', fmt(tot(s)), `${fmt(s.i)} in · ${fmt(s.o)} out`, days.length > 1 ? sparkline(series, { w: 64, h: 18 }) : null),
      kpi('Cached', `${pct(s.c || 0, s.i || 0)}%`, `${fmt(s.c || 0)} of the input`),
      kpi('Replies', full(s.r || 0), `⌀ ${fmt(s.r ? tot(s) / s.r : 0)} tokens each`),
      kpi('Reply time', s.r && s.ms ? `${(s.ms / s.r / 1000).toFixed(1)} s` : '–', s.ms ? `${Math.round((s.o || 0) / (s.ms / 1000))} out tokens/s` : null),
      kpi('Tool calls', full(s.tools || 0), s.r ? `${((s.tools || 0) / s.r).toFixed(1)} per reply` : null),
      s.cost ? kpi('API estimate', money(s.cost), 'API list-price estimate; not your bill') : null,
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
      sparkline(dayKeys(14).map((d) => tot(Meter.stats?.days?.[d]?.[dim]?.[k])), { w: 80, h: 18, stroke: colorOf?.(k) || 'var(--meter-active)' }),
    ]));
  }
  const PANES = {
    overview(days, range) {
      const out = [];
      if (range === 'today') {
        const h = Meter.stats?.days?.[dayKey()]?.h || {};
        out.push(el('h4', { text: 'Today by hour' }), bars(Array.from({ length: 24 }, (_, i) => String(i)), [{ color: 'var(--meter-active)', values: Array.from({ length: 24 }, (_, i) => h[i] || 0) }], { h: 130 }));
      } else {
        const ds = range === 'all' ? allDays().slice(-90) : days;
        const parts = ds.map((d) => sumOf([d]));
        const byAgent = store.get('meter.byAgent', false);
        const mode = el('div', { class: 'mt-seg mt-mini' }, [['type', 'by type'], ['agent', 'by agent']].map(([v, t]) => el('button', { type: 'button', text: t, class: (v === 'agent') === byAgent ? 'on' : '', on: { click: () => { store.set('meter.byAgent', v === 'agent'); dlg?.redraw(); } } })));
        const head = el('div', { class: 'mt-h4row' }, el('h4', { text: range === 'all' ? `By day (last ${ds.length} days with data)` : 'By day' }), mode);
        if (byAgent) {
          const ids = Object.keys(by('a', ds));
          out.push(head, bars(ds.map((d) => dayLabel(d, { month: 'numeric', day: 'numeric' })), ids.map((a) => ({ color: agentColor(a), values: ds.map((d) => tot(Meter.stats.days[d]?.a?.[a])) })),
            { h: 150, tips: ds.map((d) => `${dayLabel(d)}: ${ids.map((a) => `${agentName(a)} ${fmt(tot(Meter.stats.days[d]?.a?.[a]))}`).join(' · ')}`) }),
          legend(ids.map((a) => [agentName(a), agentColor(a)])));
        } else out.push(head,
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
        el('div', {}, ring(pct(s.c || 0, s.i || 0), { stroke: 'var(--meter-info)' }), el('span', { text: 'cache hits', title: `≈ ${full(cacheSaved(s.c, s.w))} tokens saved by the cache` }, cacheSaved(s.c, s.w) ? el('small', { text: ` · ≈ ${fmt(cacheSaved(s.c, s.w))} saved` }) : null)),
        el('div', {}, ring(pct(s.o || 0, tot(s)), { stroke: 'var(--meter-active)' }), el('span', { text: 'output share' })),
        ...Object.entries(Meter.prefs.budgets).filter(([, b]) => b).map(([a, b]) => el('div', {}, ring(pct(tot(by('a', [dayKey()])[a]), b), { stroke: budgetState(a) === 'over' ? 'var(--meter-over)' : budgetState(a) === 'warn' ? 'var(--meter-warn)' : 'var(--meter-ok)' }), el('span', { text: `${agentName(a)} budget` })))));
      const cs = chatStat(activeChatId());
      if (cs) {
        const win = windowFor(activeAgentId(), activeChatId());
        out.push(el('h4', { text: 'This chat' }), el('div', { class: 'mt-chatline' },
          ring(pct(cs.ctx || 0, win), { stroke: (cs.ctx || 0) > win * 0.55 ? 'var(--meter-over)' : 'var(--meter-ai)', label: fmt(cs.ctx || 0) }),
          el('span', { text: `${full(tot(cs))} tokens over ${cs.r} replies · context now ${full(cs.ctx || 0)} of ${fmt(win)} · peak ${fmt(cs.peak || 0)}${cacheSaved(cs.c, cs.w) ? ` · ≈ ${fmt(cacheSaved(cs.c, cs.w))} saved by the cache` : ''}` }),
          el('button', { type: 'button', class: 'ghost small', text: '🗜 Compact', title: 'Summarize the conversation so each message sends less (the chat keeps every message)', on: { click: () => { if (compact()) dlg?.close(); } } })));
      }
      if (range !== 'today' && allDays().length >= 7) {
        const wd = weekdays();
        out.push(el('h4', { text: 'Your week (average per weekday, all time)' }), bars(wd.map((x) => x.label), [{ color: 'var(--meter-ai)', values: wd.map((x) => x.avg) }], { h: 90, tips: wd.map((x) => `${x.label}: ⌀ ${full(x.avg)} tokens over ${x.n} days`) }));
      }
      return out;
    },
    agents: (days) => [el('h4', { text: 'Per agent' }), dimTable('a', days, agentName, agentColor)],
    models: (days) => [el('h4', { text: 'Per model' }), dimTable('m', days, (m) => (m === 'default' ? 'default (agent setting)' : m)),
      el('p', { class: 'hint', text: 'Context windows: 200k by default, 1M for [1m] models. Ask a chat or the command bar (Ctrl/⌘+;) to change one.' })],
    tools: (days) => [el('h4', { text: 'Per tool (docked directors, chat, second opinions)' }), dimTable('t', days, toolName)],
    chats(days, range) {
      const from = range === 'all' ? 0 : new Date(`${days[0]}T00:00`).getTime();
      const rows = Object.entries(Meter.stats?.chats || {}).filter(([, c]) => (c.last || 0) >= from).sort((a, b) => tot(b[1]) - tot(a[1])).slice(0, 40);
      const max = Math.max(1, ...rows.map(([, c]) => tot(c)));
      if (!rows.length) return el('p', { class: 'hint', text: 'No chats with recorded replies in this range.' });
      const filter = el('input', { type: 'search', class: 'mt-filter', placeholder: 'Filter chats…' });
      filter.addEventListener('input', () => { const q = filter.value.toLowerCase(); for (const tr of filter.closest('.mt-pane').querySelectorAll('tbody tr')) tr.hidden = Boolean(q) && !tr.textContent.toLowerCase().includes(q); });
      return [el('div', { class: 'mt-h4row' }, el('h4', { text: 'Most expensive chats (last used in this range)' }), filter), table(['Chat', 'Agent', 'Tokens', 'Replies', 'Context now', 'Peak', ''], rows.map(([id, c]) => {
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
          kpi('Tracked', `${Math.max(1, Math.round(Usage.trackedDays()))} day${Math.round(Usage.trackedDays()) > 1 ? 's' : ''}`, `${Object.keys(Usage.data.items).length} controls seen`),
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
        el('div', {}, el('h4', { text: 'Hot (your most used)' }), Usage.hot().length ? el('div', { class: 'mt-flist' }, Usage.hot().slice(0, 30).map((x) => row(x, `${x.n}×`))) : el('p', { class: 'hint', text: 'Features you use 8+ times show up here (and glow in the app).' }))));
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
      const alerts = el('input', { type: 'checkbox', checked: Meter.prefs.alerts });
      const warn = el('input', { type: 'number', min: 10, max: 100, step: 5, value: Meter.prefs.warnPct });
      const longCtx = el('input', { type: 'number', min: 0, step: 5000, value: Meter.prefs.longCtx, placeholder: '0 = off' });
      const inputs = new Map();
      const rows = natives.map((a) => {
        const input = el('input', { type: 'number', min: 0, step: 10000, value: Meter.prefs.budgets[a.id] || '', placeholder: 'no budget' });
        inputs.set(a.id, input);
        const used = tot(today[a.id]); const b = Meter.prefs.budgets[a.id];
        return el('div', { class: 'mt-brow' }, el('span', { class: 'mt-name' }, el('i', { class: 'mt-dot', style: { background: a.color || 'var(--accent)' } }), a.name),
          el('span', { class: 'hint', text: `today ${fmt(used)}${b ? ` · ${pct(used, b)}%` : ''}` }), b ? meterBar(Math.min(used, b), b, budgetState(a.id) === 'over' ? 'var(--meter-over)' : budgetState(a.id) === 'warn' ? 'var(--meter-warn)' : 'var(--meter-ok)') : el('span'), input);
      });
      const saveBtn = el('button', { type: 'button', class: 'primary small', text: 'Save', on: { click: () => {
        for (const [id, input] of inputs) { const v = Number(input.value); if (v > 0) Meter.prefs.budgets[id] = v; else delete Meter.prefs.budgets[id]; }
        Meter.prefs.alerts = alerts.checked; Meter.prefs.warnPct = Math.min(100, Math.max(10, Number(warn.value) || 80)); Meter.prefs.longCtx = Math.max(0, Number(longCtx.value) || 0);
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
        el('p', { class: 'hint', text: `Tracking since ${Meter.stats?.since ? new Date(Meter.stats.since).toLocaleDateString() : 'now'} · ${Object.keys(Meter.stats?.chats || {}).length} chats · ${allDays().length} days with replies. Estimates while streaming use ${Object.entries(Meter.prefs.calib).map(([e, v]) => `${v} characters/token (${engineLabel(e)})`).join(', ') || '4 characters per token'}.` }),
      ];
    },
  };

  return { dashboard, get dlg() { return dlg; } };
})();
