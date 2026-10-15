// Spending (round 30, budget): a simple weekly guard per AI, in ⋯ AI setup → Spending. It reads the meter's own numbers
// (Meter.stats: token-stats.json, written after every reply; nothing new is counted) and says this week's use in plain
// words (≈ tokens, and ≈ $ where the engine reports prices), takes a weekly limit (or none) and what happens near it:
//   · Warn me: a calm toast and a line in ◉ Activity at 80 % and at 100 % (once each a week). Nothing is ever blocked.
//   · Use cheaper answers: Smart (router.js) steps down one rung near the limit, two past it: a lighter model or less
//     effort, never below what a picture or a Lab build needs, never a model / effort you picked, never on "think
//     harder", never when a big context's cache would be re-read (that would cost more). The reply's chip says so.
//   · Ask before each message: the chat box asks "send it?" with the chat's size first (commands and queued lines don't).
// Costly actions that already show their cost first (crew, ✦ "take it further", look match) add "this would pass your
// weekly limit" to that same confirm (Budget.passLine). "This week at a glance": the biggest chats, where the tokens
// went, what each AI sends with every message × its replies, and one-click fixes ("Turn off Board tools for Claude:
// saves ≈ 120k a week"). Pure rules in budget-core.js (dev/budget-test.js); chat command /spending.
const Budget = (() => {
  const C = BudgetCore;
  const KEY = 'budget.limits'; // { agentId: { limit: tokens a week, mode: 'warn' | 'cheaper' | 'ask' } }
  const ALERT_KEY = 'budget.alerted'; // { 'monday|agentId|level': at }: each warning once a week
  let limits = store.get(KEY, {}) || {};
  let alerted = store.get(ALERT_KEY, {}) || {};
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const stats = () => (typeof Meter !== 'undefined' ? Meter.stats : null);
  const MODE_NAME = Object.fromEntries(C.MODES);
  // what each optional tool set is called and how it switches off (the same sets chat-cost.js offers to switch off)
  const OPTIONAL = {
    boardTools: ['Board tools', { boardTools: undefined }], captureTools: ['Screenshot tools', { captureTools: undefined }],
    appsTools: ['App window tools', { appsTools: undefined }], adobeTools: ['Adobe tools', { adobeTools: undefined }],
    deployTools: ['Publishing tools', { deployTools: undefined }],
  };
  const SET_NAME = { threeTools: 'Lab tools', chatTools: 'Chat tools', gameTools: 'Forgeheart tools', openTool: 'chat_open' };

  function state(agentId) {
    const u = C.used(stats(), agentId, C.weekDays());
    const limit = limits[agentId]?.limit || 0;
    return { ...u, limit, mode: limits[agentId]?.mode || 'warn', level: C.level(u.tokens, limit), pct: C.pct(u.tokens, limit) };
  }
  function set(agentId, patch) {
    const next = { ...(limits[agentId] || {}), ...patch };
    if (!next.limit) delete limits[agentId]; else limits[agentId] = { limit: Math.round(next.limit), mode: next.mode || 'warn' };
    store.set(KEY, limits);
    check();
  }

  // ---------- 80 % and 100 %: a toast and a line in Activity, once each a week ----------
  function check() {
    const monday = C.weekDays()[0];
    let changed = false;
    for (const a of natives()) {
      const s = state(a.id);
      if (!s.level) continue;
      const key = `${monday}|${a.id}|${s.level}`;
      if (alerted[key]) continue;
      alerted[key] = Date.now(); changed = true;
      if (s.level === 'over') alerted[`${monday}|${a.id}|near`] ||= Date.now(); // past it in one go: one warning
      const then = s.mode === 'cheaper' ? ' Smart now picks lighter answers.' : s.mode === 'ask' ? ' Each message asks first.' : '';
      const text = s.level === 'over'
        ? `${a.name} reached this week's limit: ${C.words(s)} of ${C.fmt(s.limit)}.${then} Nothing is blocked.`
        : `${a.name} is at ${s.pct}% of this week's limit (${C.words(s)} of ${C.fmt(s.limit)}).${then}`;
      toast(text, { timeout: 8000, action: { label: 'This week', fn: () => glance() } });
      document.dispatchEvent(new CustomEvent('hearth:activity', { detail: { icon: '◔', text, go: { budget: 1 } } }));
    }
    if (changed) {
      for (const k of Object.keys(alerted)) if (!k.startsWith(monday)) delete alerted[k];
      store.set(ALERT_KEY, alerted);
    }
  }
  const checkSoon = debounce(check, 1200); // after the meter has its new numbers

  // ---------- "use cheaper answers": Smart steps down ----------
  function onOptions(agentId, chat, raw, last, options, how = {}) {
    if (how.compact || typeof Router === 'undefined' || !Router._routes) return;
    const s = state(agentId);
    if (s.mode !== 'cheaper' || !s.level) return;
    const d = Router._routes.get(chat.id);
    if (!d) return;
    const agent = H.agent(agentId);
    const director = Boolean(agent?.dock);
    const images = (last?.images || []).length + (last?.attachments || []).filter((x) => x?.kind === 'image').length;
    const floor = C.floorOf({ images, director, labBuild: director && d.tier === 'hard' });
    const twin = d.engine !== agent?.engine ? H.agents().find((a) => a.mode === 'native' && a.engine === d.engine) : null;
    // what Router left alone is the owner's own pick (it never routes a pinned model / effort away)
    const pinned = { model: d.model ? undefined : options.model, effort: d.effort ? undefined : options.effort };
    const c = C.cheaper(d, { lvl: s.level, floor, R: Router, pinned, base: twin ? twin.model : agent?.model });
    if (!c) return;
    if (c.model) options.model = c.model;
    if (c.effort) options.effort = c.effort;
    Object.assign(d, { tier: c.tier, model: c.model, effort: c.effort, label: c.label, why: c.why });
  }

  // ---------- "ask before each message" ----------
  const letThrough = new WeakSet();
  async function ask(agentId, s) {
    const chatId = H.activeChat[agentId];
    const ctx = (chatId && stats()?.chats?.[chatId]?.ctx) || 0;
    const name = H.agent(agentId)?.name || 'This AI';
    const size = ctx ? ` This chat sends ${C.words(s, ctx)} with each message.` : '';
    return Modal.confirm(s.level === 'over' ? 'Past this week\'s limit' : 'Near this week\'s limit',
      `${name} has used ${C.words(s)} this week: ${s.pct}% of your ${C.fmt(s.limit)} limit.${size} Send it anyway?`, { ok: 'Send' });
  }
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form?.matches?.('form.composer')) return;
    if (letThrough.has(form)) { letThrough.delete(form); return; }
    const text = form.querySelector('textarea')?.value.trim() || '';
    if (!text || text.startsWith('/')) return;
    const a = natives().find((x) => Native.view?.(x.id)?.form === form);
    if (!a) return;
    const chatId = H.activeChat[a.id];
    if (chatId && Native.isBusy(chatId)) return; // waits in line: it asked (or not) for the one before
    const s = state(a.id);
    if (s.mode !== 'ask' || !s.level) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(a.id, s).then((yes) => { if (yes && form.isConnected) { letThrough.add(form); form.requestSubmit(); } });
  }, true);

  // ---------- "this would pass your weekly limit" (for confirms that already show a cost) ----------
  function passLine(agentId, tokens) {
    const id = agentId || H.claudeAgent?.()?.id;
    const s = state(id);
    const p = C.wouldPass(s.tokens, tokens, s.limit);
    if (!p) return '';
    const name = H.agent(id)?.name || 'This AI';
    return p.already
      ? `\n\n${name} is already past this week's limit (${C.fmt(s.tokens)} of ${C.fmt(s.limit)}).`
      : `\n\nThis would pass your weekly limit for ${name}: ${C.fmt(s.tokens)} of ${C.fmt(s.limit)} used, ≈ ${C.fmt(p.after)} after.`;
  }

  // ---------- ⋯ AI setup → Spending ----------
  const row = (label, ...kids) => el('div', { class: 'opt-row' }, el('span', { class: 'opt-label', text: label }), ...kids);
  function meterBar(s) {
    return el('div', { class: `bud-bar${s.level ? ` ${s.level}` : ''}`, title: `${s.pct}% of this week's limit` }, el('i', { style: { width: `${Math.min(100, s.pct)}%` } }));
  }
  function section(a, { repaint } = {}) {
    const s = state(a.id);
    const last = C.used(stats(), a.id, C.lastWeekDays());
    const avg = last.cost ? last : s; // a price from this week, or last week's
    const now = s.tokens ? `This week: ${C.words(s)} · ${s.replies} repl${s.replies === 1 ? 'y' : 'ies'}${s.limit ? ` · ${s.pct}% of your limit` : ''}${s.cached ? ` · ≈ ${C.fmt(C.saved(s))} saved by the cache` : ''}.` : 'This week: nothing yet.';
    const values = C.suggestions(last.tokens, s.tokens);
    if (s.limit && !values.includes(s.limit)) values.push(s.limit);
    values.sort((x, y) => x - y);
    const limitLabel = (n) => { const $ = C.priceOf(avg, n); return `≈ ${C.fmt(n)} tokens${$ >= 0.01 ? ` (≈ ${C.money($)})` : ''}`; };
    const pick = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'Weekly limit' } },
      el('option', { value: '', text: 'No limit', selected: !s.limit }),
      values.map((n) => el('option', { value: String(n), text: limitLabel(n), selected: s.limit === n })),
      el('option', { value: 'own', text: 'Your own…' }));
    pick.addEventListener('change', async () => {
      let n = Number(pick.value) || 0;
      if (pick.value === 'own') {
        const t = await Modal.prompt('Weekly limit (tokens)', { value: s.limit ? C.fmt(s.limit) : '', placeholder: 'e.g. 2M or 800k' });
        n = parseTokens(t);
        if (!n) { repaint?.(); return; }
      }
      set(a.id, { limit: n });
      repaint?.();
    });
    const mode = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'Near the limit' } }, C.MODES.map(([v, label]) => el('option', { value: v, text: label, selected: s.mode === v })));
    mode.addEventListener('change', () => { set(a.id, { mode: mode.value }); repaint?.(); });
    const smart = typeof Router === 'undefined' || Router.smartOn(a);
    const tip = s.mode === 'cheaper' && !smart ? 'Cheaper answers come from Smart: set How hard it thinks to Smart.' : 'Near the limit is 80 %. Nothing you pick yourself is ever blocked.';
    return el('section', { class: 'opt-sec bud-sec' },
      el('h4', { class: 'opt-h', text: 'Spending' }),
      el('p', { class: 'opt-hint', text: now }),
      typeof CostCoach !== 'undefined' ? CostCoach.row(a) : null, // (round 43) 🧭 Cost coach: where the tokens went, the 3 fixes that save most
      s.limit ? meterBar(s) : null,
      row('Weekly limit', pick),
      s.limit ? el('div', { class: 'opt-row', title: tip }, el('span', { class: 'opt-label', text: 'Near it' }), mode) : null,
      s.limit && s.mode === 'cheaper' && !smart ? el('p', { class: 'opt-hint', text: tip }) : null,
      typeof Autocompact !== 'undefined' ? Autocompact.row(a, { repaint }) : null, // (round 34) offer to continue lighter at about N tokens
      typeof TokenAudit !== 'undefined' ? TokenAudit.section(a, { repaint }) : null, // (round 36) where its tokens go: the fixed part of each message, trims
      el('div', { class: 'opt-row' }, el('button', { type: 'button', class: 'ghost small', text: 'This week at a glance…', title: 'Biggest chats, biggest tools, one-click fixes', on: { click: () => glance() } })));
  }
  const parseTokens = (t) => { const m = String(t || '').trim().toLowerCase().replace(/,/g, '').match(/^([\d.]+)\s*([km]?)/); return m ? Math.round(Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1)) : 0; };

  // ---------- this week at a glance ----------
  const setsCache = new Map(); // agent signature → Promise<[[set, tokens]]>
  function setsOf(a) {
    const sig = JSON.stringify([a.id, a.engine, a.dock, a.threeTools, a.gameTools, a.chatTools, a.boardTools, a.captureTools, a.appsTools, a.adobeTools, a.deployTools, a.openTool, a.nodesTool, a.toolMode]);
    if (!setsCache.has(sig)) setsCache.set(sig, Promise.resolve(window.hub.directorCost?.([{ ...JSON.parse(JSON.stringify(a)), exact: true }])).then((r) => r?.directors?.[0]?.tools || []).catch(() => []));
    return setsCache.get(sig);
  }
  async function data() {
    if (typeof Meter !== 'undefined') await Meter.refresh?.();
    const agents = natives();
    const sets = {};
    await Promise.all(agents.map(async (a) => { sets[a.id] = await setsOf(a); }));
    const titles = new Map(H.chats.map((c) => [c.id, c.title]));
    return C.week(stats(), { agents, limits, sets, optional: OPTIONAL, chatTitle: (id) => titles.get(id) || 'A chat' });
  }
  let saveAgent = async (agentId, patch) => {
    for (const t of new Set([H.agent(agentId)].filter(Boolean))) for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete t[k]; else t[k] = v; }
    await saveConfig();
  };
  async function applyFix(f) {
    if (f.patch) { await saveAgent(f.agentId, f.patch); setsCache.clear(); toast('Done: from its next message.', { timeout: 1800 }); return true; }
    if (f.kind === 'fresh') { Native.open(f.agentId, f.chatId); setTimeout(() => Commands.exec('/fresh', f.agentId), 300); return true; }
    return false;
  }
  const placeName = (k) => ({ chat: 'Chats', 'second-opinion': 'Second opinions', untracked: 'Older replies' }[k] || Tools.get?.(k)?.name || k);
  let dlg = null;
  async function glance() {
    dlg?.close();
    const w = await data();
    const x = el('button', { type: 'button', class: 'ghost bud-x', text: '×', title: 'Close (Esc)', on: { click: () => dlg?.close() } });
    const part = (title, ...kids) => (kids.flat().filter(Boolean).length ? el('section', { class: 'bud-part' }, el('h4', { text: title }), ...kids) : null);
    const line = (label, value, extra) => el('div', { class: 'bud-line' }, el('span', { class: 'bud-l', text: label }), el('b', { text: value }), extra || null);
    const fixes = w.fixes.map((f) => {
      const b = el('button', { type: 'button', class: 'primary small', text: 'Fix' });
      b.addEventListener('click', async () => { b.disabled = true; if (await applyFix(f)) { b.textContent = '✓'; if (f.kind === 'fresh') dlg?.close(); } });
      return el('div', { class: 'bud-line bud-fix' }, el('span', { class: 'bud-l', text: f.text }), b);
    });
    dlg = el('dialog', { class: 'ui-modal bud-dlg' },
      el('div', { class: 'bud-head' }, el('h2', { text: 'This week' }), el('span', { class: 'bud-sub', text: w.all.tokens ? `${C.words(w.all)} · ${w.all.replies} replies${w.all.saved ? ` · ≈ ${C.fmt(w.all.saved)} saved by the cache` : ''}` : 'Nothing yet this week.', title: w.all.saved ? `${C.fmt(w.all.cached)} input tokens came from the prompt cache this week (read at about a tenth of the price)` : '' }), el('span', { class: 'spacer' }), x),
      part('Each AI', w.per.map((p) => el('div', {}, line(p.name, `${C.words(p)}${p.limit ? ` · ${p.pct}% of ${C.fmt(p.limit)}` : ''}`, p.limit ? el('span', { class: 'bud-mode', text: MODE_NAME[p.mode] }) : null), p.limit ? meterBar(p) : null))),
      part('Biggest chats', w.chats.map((c) => el('div', { class: 'bud-line bud-click', title: 'Open it', on: { click: () => { dlg?.close(); Native.open(c.agentId, c.id); } } },
        el('span', { class: 'bud-l', text: c.title }), el('b', { text: `≈ ${C.fmt(c.tokens)}` }), el('small', { text: `${c.replies} repl${c.replies === 1 ? 'y' : 'ies'}${c.ctx ? ` · ${C.fmt(c.ctx)} a message now` : ''}` })))),
      part('Where it went', w.where.map((p) => line(placeName(p.key), `≈ ${C.fmt(p.tokens)}`))),
      part('Sent with every message', w.tools.map((t) => line(`${OPTIONAL[t.key]?.[0] || SET_NAME[t.key] || t.key} · ${t.agentName}`, `≈ ${C.fmt(t.week)} a week`, el('small', { text: `${C.fmt(t.each)} × each reply (mostly cached)` })))),
      part('Fixes', fixes),
      w.fixes.length ? null : el('p', { class: 'opt-hint', text: 'Nothing to fix: this week is lean.' }));
    dlg.addEventListener('close', () => { const d = dlg; setTimeout(() => d?.remove(), 0); if (dlg === d) dlg = null; });
    document.body.append(dlg);
    dlg.showModal();
    return w;
  }
  function text() {
    const rows = natives().map((a) => [a, state(a.id)]).filter(([, s]) => s.tokens || s.limit)
      .map(([a, s]) => `- ${a.name}: ${C.words(s)} this week${s.limit ? ` · ${s.pct}% of ${C.fmt(s.limit)} · near it: ${MODE_NAME[s.mode].toLowerCase()}` : ' · no limit'}`);
    return rows.length ? rows.join('\n') : 'Nothing used this week yet.';
  }

  // ---------- hooks, command, palette ----------
  if (typeof Native !== 'undefined' && Native.hooks) {
    (Native.hooks.options ||= []).push(onOptions); // after router.js's own (it loads first): steps its pick down
    Native.hooks.finish.push(() => checkSoon());
  }
  document.addEventListener('hearth:usage', () => checkSoon());
  if (typeof Commands !== 'undefined' && !Commands.get('spending')) {
    Commands.register({
      name: 'spending', area: 'Meter', args: '[week | limit <tokens|none> | near <warn|cheaper|ask>]',
      desc: 'This week\'s use per AI and its weekly limit; the week at a glance with fixes; set this AI\'s limit and what happens near it',
      keywords: 'budget weekly limit spending cost cheaper warn tokens dollars',
      examples: ['/spending', '/spending week', '/spending limit 2M', '/spending near cheaper', '/spending limit none'],
      complete: (q) => [{ value: 'week', hint: 'at a glance' }, { value: 'limit ', hint: 'tokens a week, or none' }, ...C.MODES.map(([v, l]) => ({ value: `near ${v}`, hint: l }))].filter((x) => x.value.startsWith(String(q || '').toLowerCase())),
      run: async (args, ctx) => {
        const a = String(args || '').trim();
        const agentId = H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : H.claudeAgent()?.id;
        const name = H.agent(agentId)?.name || 'This AI';
        if (/^week/i.test(a)) { await glance(); return null; }
        let m = /^limit\s+(.+)$/i.exec(a);
        if (m) {
          if (/^(none|off|no)$/i.test(m[1].trim())) { set(agentId, { limit: 0 }); return `${name}: no weekly limit.`; }
          const n = parseTokens(m[1]);
          if (!n) return 'Say a number of tokens, like 2M or 800k (or none).';
          set(agentId, { limit: n });
          return `${name}: weekly limit ≈ ${C.fmt(n)} tokens (near it: ${MODE_NAME[state(agentId).mode].toLowerCase()}).`;
        }
        m = /^near\s+(\w+)/i.exec(a);
        if (m) {
          const v = C.MODES.find(([k]) => k.startsWith(m[1].toLowerCase()))?.[0];
          if (!v) return 'Near it: warn, cheaper or ask.';
          if (!limits[agentId]) return `${name} has no weekly limit yet: /spending limit 2M first.`;
          set(agentId, { mode: v });
          return `${name}, near the weekly limit: ${MODE_NAME[v].toLowerCase()}.`;
        }
        return text();
      },
    });
  }
  AppUI.addAction?.('Spending: this week at a glance', () => glance());
  check();

  return { state, set, passLine, section, glance, text, check, get limits() { return limits; },
    _test: { onOptions, data, applyFix, parseTokens, setSave: (fn) => { saveAgent = fn; }, resetAlerts: () => { alerted = {}; store.set(ALERT_KEY, alerted); } } };
})();
window.Budget = Budget;
