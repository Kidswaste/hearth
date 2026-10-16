// ⏳ Usage left (round 48, usagelimits): how much of each AI's plan is left, in the Usage window (the meter's
// dashboard: a click on the meter, Ctrl/⌘+Shift+U, /usage), with a heads-up of when it runs out at your pace and the
// three changes that save the most from now on (Cost coach's fixes, one click each, with Undo).
//   One card per AI (Claude, Astra): a slim bar per window (used / left, the reset countdown), how fresh it is ("as of
//   3 min ago"), today's and the week's tokens with a tiny sparkline, the forecast line.
//   Where the numbers come from, all 0 tokens: Claude Code's own rate_limit_event with each reply (engines.js → the
//   engine:live channel), a refused message ("limit reached · resets 6pm"), Claude Code's local /usage command when
//   the window opens (usagelimitsmain.js: no model request), Astra's account limits (codex-usage.js). Unknown stays
//   unknown: nothing is guessed.
//   Calm notes through Hints at 80 % and 95 % of a window and when it resets (each once per window), a desktop
//   notification too when you're away and "Tell me when…" allows it. Nothing is ever blocked.
// Its own small store (kv usage-limits) follows scenesafe's rule: a read that fails is never "empty", nothing is saved
// before a real read. Ways in: the Usage window, Ctrl/⌘+K "Usage left", /usage-left (alias /limits).
const UsageLimits = (() => {
  const C = UsageLimitsCore;
  const KV = 'usage-limits';
  const NAMES = { claude: 'Claude', codex: 'Astra' };
  const natives = () => (typeof H !== 'undefined' ? H.agents().filter((a) => a.mode === 'native') : []);
  const enginesUsed = () => ['claude', 'codex'].filter((e) => natives().some((a) => a.engine === e));
  const idsOf = (engine) => natives().filter((a) => a.engine === engine).map((a) => a.id);

  // ---------- its store (scenesafe: unreadable is never empty; no save before a real read) ----------
  let mem = null; // { state, value }
  let reading = null;
  function readStore() {
    reading ||= (async () => {
      try {
        const r = await window.hub.kvGet(KV, null, { status: true });
        if (r && typeof r === 'object' && typeof r.state === 'string') mem = { state: r.state, value: C.clean(r.state === 'ok' ? r.value : r.state === 'missing' && r.prev ? r.prev : null) };
        else mem = { state: r == null ? 'missing' : 'ok', value: C.clean(r) };
      } catch { mem = { state: 'unreadable', value: C.clean(null) }; }
      return mem;
    })();
    return reading;
  }
  let saveT = null;
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      if (!mem || mem.state === 'unreadable') return; // couldn't read it: never write over it
      try { await window.hub.kvSet(KV, C.clean(mem.value)); mem.state = 'ok'; } catch { /* next change tries again */ }
    }, 800);
  }

  // ---------- what the engines say ----------
  async function note(engine, list) {
    if (!list?.length) return false;
    await readStore();
    const r = C.merge(mem.value, engine, list);
    if (!r.changed) return false;
    mem.value = r.state;
    saveSoon();
    repaint();
    checkSoon();
    return true;
  }
  const agentOfChat = (chatId) => (H.chats || []).find((c) => c.id === chatId)?.agentId
    || H.agents().filter((a) => chatId?.startsWith(`${a.id}-`)).sort((a, b) => b.id.length - a.id.length)[0]?.id || null;
  function wire() {
    window.hub.onEngineLive?.((ev) => { if (ev?.type === 'limits') note(ev.engine || 'claude', C.fromEvent(ev.info, ev.at || Date.now())).catch(() => {}); });
    window.hub.onEngineEvent?.((ev) => {
      if (ev?.type !== 'error' || !ev.message) return;
      const engine = H.agent(agentOfChat(ev.chatId))?.engine;
      if (engine === 'claude' || engine === 'codex') note(engine, C.fromError(ev.message)).catch(() => {});
    });
    // Astra's account limits after its replies (a light account read, no tokens), at most every 30 minutes
    let astraAt = 0;
    document.addEventListener('hearth:usage', (e) => {
      if (H.agent(e.detail?.agentId)?.engine !== 'codex' || Date.now() - astraAt < 30 * 60e3) return;
      astraAt = Date.now();
      readAstra().catch(() => {});
    });
  }
  const errors = {}; // engine → the plain reason a read gave nothing
  async function readClaude({ fresh = false } = {}) {
    if (!window.hub.usageLimitsClaude || !enginesUsed().includes('claude')) return null;
    await readStore();
    if (mem.value.claudeUsage?.off) return { ok: false, why: 'off' }; // a copy once answered it with a model turn: never again
    const r = await window.hub.usageLimitsClaude({ fresh }).catch(() => null);
    if (r?.why === 'model') { mem.value.claudeUsage = { off: true, at: Date.now() }; saveSoon(); }
    if (!r?.ok) { errors.claude = r?.why || 'failed'; return r; }
    const list = C.fromUsageText(r.text, r.at || Date.now());
    if (!list.length) errors.claude = 'none'; else delete errors.claude;
    await note('claude', list);
    return r;
  }
  async function readAstra() {
    if (!window.hub.getCodexUsage || !enginesUsed().includes('codex')) return null;
    const r = await window.hub.getCodexUsage().catch(() => null);
    if (!r?.available) { errors.codex = r?.error || 'Astra\'s account limits are unavailable for this sign-in.'; return r; }
    delete errors.codex;
    await note('codex', C.fromCodex(r));
    return r;
  }

  // ---------- the cards ----------
  const svgNS = 'http://www.w3.org/2000/svg';
  function spark(values) {
    const w = 64; const h = 16; const max = Math.max(1, ...values);
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('width', w); s.setAttribute('height', h); s.setAttribute('aria-hidden', 'true'); s.classList.add('ul-spark');
    const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 1.5 - (v / max) * (h - 3)).toFixed(1)}`).join(' ');
    const area = document.createElementNS(svgNS, 'polygon'); area.setAttribute('points', `1,${h} ${pts} ${w - 1},${h}`); area.classList.add('ul-spark-a');
    const line = document.createElementNS(svgNS, 'polyline'); line.setAttribute('points', pts); line.classList.add('ul-spark-l');
    s.append(area, line);
    return s;
  }
  const SOURCE = { event: 'reported by Claude Code with a reply', usage: 'from Claude Code\'s own /usage (no tokens)', error: 'from a message the plan refused', account: 'from your Codex account (no tokens)' };
  function windowRow(v, engine) {
    const name = NAMES[engine];
    if (v.reset) {
      return el('div', { class: 'ul-win reset' },
        el('div', { class: 'ul-top' }, el('span', { class: 'ul-name', text: v.label }), el('span', { class: 'ul-num', text: 'reset' })),
        el('div', { class: 'ul-bar', attrs: { role: 'img', 'aria-label': `${name} ${v.label}: reset at ${C.when(v.resetsAt)}; new numbers with the next message` } }, el('i', { style: { transform: 'scaleX(0)' } })),
        el('div', { class: 'ul-sub' }, el('span', { text: `Reset ${C.when(v.resetsAt)}` }), el('span', { text: 'new numbers with your next message' })));
    }
    const resetWords = v.resetIn != null ? (v.resetIn < 864e5 ? `resets in ${C.countdown(v.resetIn)}` : `resets ${C.when(v.resetsAt)}`) : 'reset time not known';
    const usedW = v.used == null ? 'not known' : `${v.used}% used`;
    const leftW = v.left == null ? '–' : `${v.left}%`;
    const tip = `${SOURCE[v.source] || ''} · as of ${v.ago}${v.resetsAt ? ` · resets ${new Date(v.resetsAt).toLocaleString()}` : ''}`;
    return el('div', { class: `ul-win lv-${v.level}`, title: tip },
      el('div', { class: 'ul-top' }, el('span', { class: 'ul-name', text: v.label }), el('span', { class: 'ul-num' }, el('b', { text: leftW }), v.left == null ? '' : ' left')),
      el('div', { class: 'ul-bar', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', ...(v.used == null ? {} : { 'aria-valuenow': String(v.used) }), 'aria-label': `${name} ${v.label}: ${usedW}${v.left == null ? '' : `, ${v.left}% left`}, ${resetWords}` } },
        el('i', { style: { transform: `scaleX(${v.used == null ? 0 : v.used / 100})` } })),
      el('div', { class: 'ul-sub' }, el('span', { text: usedW }), el('span', { text: resetWords })));
  }
  function localFor(engine, v, now) {
    const stats = typeof Meter !== 'undefined' ? Meter.stats : null;
    const start = v?.resetsAt && C.WINDOWS[v.key]?.ms ? v.resetsAt - C.WINDOWS[v.key].ms : null;
    return C.localTokens(stats, idsOf(engine), { now, start });
  }
  function card(engine, now = Date.now()) {
    const st = mem?.value || C.clean(null);
    const vs = C.views(st, engine, now);
    const e = st.engines[engine];
    const freshest = vs.reduce((m, v) => Math.max(m, v.at || 0), 0);
    const week = vs.find((v) => v.key === 'seven_day');
    const local = localFor(engine, week, now);
    const outlook = vs.map((v) => {
      const w = e?.windows?.[v.key];
      const f = C.forecast(w, { now, samples: e?.samples?.[v.key] || [], key: v.key, local: v.key === 'seven_day' ? local : null });
      return { key: v.key, f, words: C.forecastWords(f, v.key, now, w?.resetsAt) };
    });
    const head = C.headline(outlook);
    const unknown = errors[engine];
    const empty = engine === 'claude'
      ? (unknown === 'old' ? 'Not known yet: Claude Code reports it with your next Claude message (an update of Claude Code can also read it right away).' : 'Not known yet: Claude Code reports it with your next Claude message.')
      : (unknown || 'Not known yet.');
    return el('article', { class: `ul-card ul-${engine}`, attrs: { 'aria-label': `${NAMES[engine]}: usage left` } },
      el('header', { class: 'ul-head' }, el('b', { class: 'ul-who', text: NAMES[engine] }),
        el('small', { class: 'ul-fresh', text: freshest ? `as of ${C.ago(now - freshest)}` : '' })),
      vs.length ? el('div', { class: 'ul-wins' }, vs.map((v) => windowRow(v, engine))) : el('p', { class: 'ul-unknown', text: empty }),
      head ? el('p', { class: `ul-ahead ${head.f.state}${head.f.high ? ' hit' : ''}`, text: head.words }) : null,
      el('div', { class: 'ul-tok', title: 'Counted on this computer by the meter (Hearth\'s own traffic)' },
        el('span', { text: `Today ≈ ${C.fmt(local.today)} · 7 days ≈ ${C.fmt(local.week)} tokens` }), spark(local.spark)));
  }

  // ---------- How to save from now on (Cost coach's fixes) ----------
  async function tips(box) {
    try { if (typeof CostCoach === 'undefined' && window.Lazy) await Lazy.load('costcoach'); } catch { /* without it: no tips */ }
    if (typeof CostCoach === 'undefined') { box.remove(); return; }
    const res = await CostCoach.compute().catch(() => null);
    if (!box.isConnected) return;
    if (!res) { box.replaceChildren(el('h4', { text: 'How to save from now on' }), el('p', { class: 'ul-unknown', text: 'Couldn\'t read the chats just now.' })); return; }
    const now = Date.now();
    const rows = res.top.slice(0, 3).map((f) => {
      const engine = H.agent(f.agentId)?.engine;
      const w = mem?.value?.engines?.[engine]?.windows?.seven_day;
      const share = w && !(w.resetsAt && now >= w.resetsAt) ? C.shareOfWeek(f.saves, w, localFor(engine, C.view(w, now, 'seven_day'), now)) : null;
      const b = el('button', { type: 'button', class: 'primary small ul-go', text: f.button, attrs: { 'aria-label': `${f.button}: ${f.text}` } });
      const row = el('div', { class: 'ul-tip', title: f.why || '' },
        el('div', { class: 'ul-tip-w' }, el('span', { text: f.text }),
          el('small', { text: `${share ? `≈ ${share}% of ${NAMES[engine]}'s weekly limit · ` : ''}estimated from your last 7 days` })), b);
      b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await CostCoach.apply(f).catch((err) => ({ ok: false, error: err?.message || String(err) }));
        if (!r.ok) { b.disabled = false; toast(r.error || 'Not changed.', { timeout: 4000 }); return; }
        row.classList.add('done'); b.textContent = '✓ Done';
        const u = el('button', { type: 'button', class: 'ghost small ul-undo', text: 'Undo', attrs: { 'aria-label': `Undo: ${f.button}` } });
        u.addEventListener('click', async () => { u.disabled = true; await r.undo(); row.classList.remove('done'); b.disabled = false; b.textContent = f.button; u.remove(); }, { once: true });
        b.after(u);
        toast(`Done: ${f.button.toLowerCase()} (${H.agent(f.agentId)?.name || 'this AI'}), from its next message.`, { timeout: 7000, action: { label: 'Undo', fn: () => u.click() } });
      });
      return row;
    });
    box.replaceChildren(el('h4', { text: 'How to save from now on' }),
      ...(rows.length ? rows : [el('p', { class: 'ul-unknown', text: res.total ? 'Nothing worth changing: your week is lean.' : 'Nothing used in the last 7 days.' })]),
      ...[...res.lean.slice(0, rows.length ? 1 : 2), ...res.lean.filter((l, i) => /^histlean:/.test(l.id) && i >= (rows.length ? 1 : 2)).slice(0, 1)].map((l) => el('p', { class: 'ul-lean', text: l.text }))); // (round 50, historylean) the lighter history's effect, always shown when it happened
  }

  // ---------- the section in the Usage window ----------
  let host = null; let tick = null; let sig = '';
  function paintCards() {
    if (!host?.isConnected) return;
    const cards = host.querySelector('.ul-cards');
    if (!cards) return;
    const list = enginesUsed().map((e) => card(e));
    const s = list.map((n) => n.textContent + n.querySelector('.ul-wins')?.innerHTML).join('|');
    if (s === sig) return; // nothing changed: no DOM write
    sig = s;
    cards.replaceChildren(...list);
  }
  let repaintT = null;
  function repaint() { if (!host?.isConnected) return; clearTimeout(repaintT); repaintT = setTimeout(paintCards, 50); }
  async function paint(section) {
    host = section; sig = '';
    section.classList.add('ul-host');
    const tipsBox = el('section', { class: 'ul-tips', attrs: { 'aria-label': 'How to save from now on' } }, el('h4', { text: 'How to save from now on' }), el('p', { class: 'ul-unknown', text: 'Looking at your last 7 days…' }));
    section.replaceChildren(
      el('div', { class: 'ul-title' }, el('h3', { text: 'Usage left' }), el('small', { text: 'from each AI\'s own plan · checked here, 0 tokens' })),
      el('div', { class: 'ul-cards' }), (() => { try { return window.Routines?.usageBox?.() || ''; } catch { return ''; } })(), tipsBox); // (round 51, routinelean) what 🔁 Keep going spent and did
    await readStore();
    paintCards();
    clearInterval(tick);
    tick = setInterval(() => { if (!host?.isConnected) { clearInterval(tick); tick = null; return; } paintCards(); }, 30000); // the countdowns
    const claudeAge = Date.now() - Math.max(0, ...Object.values(mem.value.engines.claude?.windows || {}).map((w) => w.at || 0));
    await Promise.all([claudeAge > 5 * 60e3 ? readClaude() : null, readAstra()].map((p) => Promise.resolve(p).catch(() => null)));
    sig = ''; paintCards();
    tips(tipsBox).catch(() => tipsBox.remove());
  }
  async function open() {
    if (typeof Meter !== 'undefined') return Meter.dashboard();
    return null;
  }

  // ---------- the calm notes (Hints), and a notification while you're away ----------
  let checkT = null;
  function checkSoon() { clearTimeout(checkT); checkT = setTimeout(() => check().catch(() => {}), 1500); }
  let checking = null;
  function check(o) { checking ||= checkNow(o).finally(() => { checking = null; }); return checking; }
  async function checkNow({ now = Date.now() } = {}) {
    await readStore();
    if (mem.state === 'unreadable') return [];
    const due = C.heads(mem.value, now, NAMES);
    const out = [];
    for (const d of due.slice(0, 2)) {
      const show = () => toast(d.text, { timeout: 10000, action: { label: 'See usage', fn: () => open() } });
      const shown = window.Hints ? await Hints.offer({ id: `usagelimits:${d.id}`, rank: 45, ttl: 30 * 60e3, show }) : Boolean(show());
      if (window.Notify?.send) Notify.send({ type: 'limit', title: d.level === 'reset' ? 'Usage limit reset' : 'Usage heads-up', body: d.text, group: 'usagelimits' }).catch?.(() => {});
      for (const id of [d.id, ...d.also]) mem.value.noted[id] = now; // once per window, shown or not (tips off stays off)
      out.push({ ...d, shown });
    }
    if (out.length) saveSoon();
    return out;
  }

  // ---------- in words (/usage-left) ----------
  function words(now = Date.now()) {
    const st = mem?.value || C.clean(null);
    const lines = [];
    for (const e of enginesUsed()) {
      const vs = C.views(st, e, now);
      if (!vs.length) { lines.push(`${NAMES[e]}: not known yet${e === 'claude' ? ' (Claude Code reports it with your next Claude message)' : ''}.`); continue; }
      lines.push(`${NAMES[e]} (as of ${C.ago(now - Math.max(...vs.map((v) => v.at)))}):`);
      for (const v of vs) lines.push(v.reset ? `- ${v.label}: reset ${C.when(v.resetsAt, now)}` : `- ${v.label}: ${v.left == null ? 'not known' : `${v.left}% left`}${v.resetIn != null ? ` · resets in ${C.countdown(v.resetIn)}` : ''}`);
      const w = st.engines[e]?.windows?.seven_day;
      if (w) { const f = C.forecast(w, { now, samples: st.engines[e].samples.seven_day || [], key: 'seven_day', local: localFor(e, C.view(w, now, 'seven_day'), now) }); const t = C.forecastWords(f, 'seven_day', now, w.resetsAt); if (t) lines.push(`  ${t}`); }
    }
    return lines.join('\n') || 'No AI is set up yet.';
  }

  // ---------- ways in ----------
  if (typeof Commands !== 'undefined' && !Commands.get('usage-left')) {
    Commands.register({
      name: 'usage-left', aliases: Commands.get('limits') ? [] : ['limits'], area: 'Meter', args: '[open]',
      desc: 'How much of each AI\'s plan is left (session and week), when it resets, and when you\'d run out at your pace; open: the Usage window',
      keywords: 'usage left limit limits plan session weekly reset remaining quota how long heads up forecast',
      examples: ['/usage-left', '/usage-left open'],
      complete: (q) => [{ value: 'open', hint: 'the Usage window' }].filter((x) => x.value.startsWith(String(q || '').toLowerCase())),
      run: async (args) => {
        if (/^open/i.test(String(args || '').trim())) { await open(); return null; }
        await readStore();
        if (Date.now() - Math.max(0, ...Object.values(mem.value.engines.claude?.windows || {}).map((w) => w.at || 0)) > 5 * 60e3) await readClaude().catch(() => null);
        return words();
      },
    });
  }
  AppUI.addAction?.('Usage left — how much of each AI\'s plan is left, and when it resets', () => open());
  wire();
  readStore().then(() => checkSoon());
  if (window.Power?.every) Power.every('usagelimits', 5 * 60e3, () => check().catch(() => {}), { first: 60000, hidden: 'skip' }); // the reset notes

  return { paint, open, note, check, words, readClaude, readAstra,
    get state() { return mem?.value || null; },
    _test: { readStore, get mem() { return mem; }, errors, reset: () => { reading = null; mem = null; } } };
})();
window.UsageLimits = UsageLimits;
