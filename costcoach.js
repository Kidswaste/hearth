// 🧭 Cost coach (round 43, costcoach). Hearth has many token savers, each in its own corner (Continue lighter, Smart,
// short answers, tools that sleep, lean attachments, lean handoffs…). The coach looks at the last 7 days, on this
// computer and for 0 tokens, and says where the owner's tokens really went and which 3 changes would have saved the
// most, each a click on the existing setting:
//   · where it went: by AI, by kind of chat (Lab director, plain, missions, routines, the rest), by cause (re-reading
//     long chats, instructions, tool definitions, attachments, thinking, answers) + cache misses, handoffs, swarms
//   · the fixes, from real numbers (costcoach-core.js): "Claude's Lab chats re-read ≈ 480k tokens this week; Continue
//     lighter at 40k would have saved ≈ 210k — Turn on", "Astra thinks on Deep for quick questions — Let Smart
//     decide", "Claude wrote ≈ 90k tokens of answers — Make answers short", an unused tool → Turn off, a pinned swarm
//     → Unpin; what is already lean says so with ✓ ("Board tools … now sleep until needed ✓")
//   · nothing changes without a click; each fix is an ordinary change in the app's undo log (undoall: Ctrl/⌘+Z,
//     Activity › Recent changes) and its toast has Undo
// Ways in: ⋯ AI setup › Spending › 🧭 Cost coach…, Ctrl/⌘+K "Spending: cost coach", /cost-coach, and a calm weekly
// note through Hints (once a week, only when one fix would have saved ≥ 10 % of the week).
// Its own small store (kv cost-coach: the weeks noted, the fixes applied) follows scenesafe's rule: a read that fails
// is never "empty", and nothing is saved before a real read.
const CostCoach = (() => {
  const C = CostCoachCore;
  const KV = 'cost-coach';
  const TTL = 5 * 60000; // a look is reused this long
  const SLEEPY = new Set(['boardTools', 'captureTools', 'adobeTools', 'deployTools', 'appsTools']); // toolwake.js: these sleep until needed
  const natives = () => H.agents().filter((a) => a.mode === 'native');

  // ---------- its own store (scenesafe: unreadable is never empty; no save before a real read) ----------
  let mem = null; // { state: 'ok' | 'missing' | 'unreadable', value }
  let reading = null;
  function readStore(fresh = false) {
    if (fresh) reading = null;
    reading ||= (async () => {
      try {
        const r = await window.hub.kvGet(KV, null, { status: true });
        if (r && typeof r === 'object' && typeof r.state === 'string') mem = { state: r.state, value: C.cleanStore(r.state === 'ok' ? r.value : r.state === 'missing' && r.prev ? r.prev : null) };
        else mem = { state: r == null ? 'missing' : 'ok', value: C.cleanStore(r) }; // an older main: the value itself
      } catch { mem = { state: 'unreadable', value: C.cleanStore(null) }; }
      return mem;
    })();
    return reading;
  }
  async function saveStore() {
    if (!mem || mem.state === 'unreadable') return false; // couldn't read it: never write over it
    mem.value = C.cleanStore(mem.value);
    try { await window.hub.kvSet(KV, mem.value); mem.state = 'ok'; return true; } catch { return false; }
  }

  // ---------- the look (all local) ----------
  let cache = null; // { at, p: Promise<result> }
  const audits = new Map(); // agentId → the tokenaudit breakdown used (its lines, for Turn off)
  async function fixedOf(a) {
    if (typeof TokenAudit === 'undefined' || !TokenAudit.breakdownOf) return null;
    const b = await Promise.race([TokenAudit.breakdownOf(a).catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
    if (!b) return null;
    audits.set(a.id, b);
    const trims = [];
    for (const t of b.tools || []) {
      const sleeps = t.kind === 'set' && SLEEPY.has(t.id) && a[t.id] && !t.used;
      if (sleeps) trims.push({ key: t.key, id: t.id, label: t.label, saves: (t.tokens || 0) + (t.guide || 0), sleeps: true });
      else if (t.trim?.kind === 'off' && !(t.kind === 'set' && SLEEPY.has(t.id))) trims.push({ key: t.key, id: t.id, label: t.label, saves: t.trim.saves });
    }
    return { prompt: b.promptTotal || 0, tools: b.toolsTotal || 0, trims };
  }
  async function compute({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cache.at < TTL) return cache.p;
    const p = (async () => {
      try { if (typeof Meter !== 'undefined') await Meter.refresh?.(); } catch { /* the chats still say */ }
      const scan = (await window.hub.costCoachScan?.({ days: C.WINDOW_DAYS }).catch(() => null)) || { records: [], chats: {} };
      const agents = natives().map((a) => ({ id: a.id, name: a.name, engine: a.engine, dock: a.dock || '', effort: a.effort, verbosity: a.verbosity, lighterAt: a.lighterAt }));
      const used = new Set(scan.records.map((r) => r.agent));
      const fixed = {};
      await Promise.all(natives().filter((a) => used.has(a.id)).map(async (a) => { const f = await fixedOf(a); if (f) fixed[a.id] = f; }));
      const pinned = {};
      for (const a of agents) { try { const v = store.get(`mission.sticky.${a.id}`, null); if (v) pinned[a.id] = v; } catch { /* none */ } }
      const res = C.analyse(scan.records, { agents, stats: typeof Meter !== 'undefined' ? Meter.stats : null, fixed, pinned });
      res.chats = scan.chats || {};
      return res;
    })();
    cache = { at: Date.now(), p };
    p.then((r) => { if (cache?.p === p) cache.done = r; }, () => { if (cache?.p === p) cache = null; });
    return p;
  }
  const last = () => cache?.done || null;

  // ---------- one click: the existing setting ----------
  const undoList = () => (typeof UndoAll !== 'undefined' ? UndoAll.list() : []);
  async function apply(f) {
    const a = H.agent(f.agentId);
    if (!a) return { ok: false, error: 'That AI is gone.' };
    const before = new Set(undoList().map((e) => e.id));
    const fx = f.fix || {};
    let back = null; // a fallback undo when the app's undo log isn't loaded
    if (fx.type === 'agent') {
      const was = Object.fromEntries(Object.keys(fx.patch).map((k) => [k, a[k]]));
      for (const [k, v] of Object.entries(fx.patch)) { if (v === undefined) delete a[k]; else a[k] = v; }
      await saveConfig();
      if (typeof Cachewise !== 'undefined') Cachewise.changed?.(a.id); // a mid-chat change: its one calm line about the cache
      back = async () => { const b = H.agent(f.agentId); if (!b) return; for (const [k, v] of Object.entries(was)) { if (v === undefined) delete b[k]; else b[k] = v; } await saveConfig(); };
    } else if (fx.type === 'trim') {
      const line = (audits.get(a.id)?.tools || []).find((t) => t.key === fx.key);
      if (!line || typeof TokenAudit === 'undefined') return { ok: false, error: 'Open ⋯ AI setup › Spending › Where its tokens go to switch it off.' };
      const patch = TokenAudit.offPatch(a, line);
      const was = Object.fromEntries(Object.keys(patch).map((k) => [k, a[k] === undefined ? undefined : JSON.parse(JSON.stringify(a[k]))]));
      await TokenAudit.turnOff(a.id, line, { quiet: true });
      back = async () => { const b = H.agent(f.agentId); if (!b) return; for (const [k, v] of Object.entries(was)) { if (v === undefined) delete b[k]; else b[k] = v; } await saveConfig(); };
    } else if (fx.type === 'unpin') {
      if (typeof Missions === 'undefined') return { ok: false, error: 'Missions aren\'t loaded.' };
      const key = `mission.sticky.${a.id}`;
      const was = store.get(key, null);
      Missions.set(a.id, 'normal', { keep: true });
      if (typeof UndoAll !== 'undefined' && UndoAll.stored) UndoAll.stored({ key, label: `Unpinned ${C.MISSION_NAME[was] || 'a mission'} for ${a.name}`, was, now: null, via: 'mission', agentId: a.id });
      back = async () => { Missions.set(a.id, was || 'normal', { keep: true }); };
    } else return { ok: false, error: 'Nothing to change.' };
    const entry = undoList().find((e) => !before.has(e.id)) || null;
    cache = null; // the next look sees the change
    if (mem) { mem.value.applied.push({ id: f.id, at: Date.now(), saves: f.saves, text: f.text }); saveStore(); }
    const undo = async () => { if (entry && typeof UndoAll !== 'undefined') await UndoAll.undo(entry); else await back?.(); cache = null; };
    return { ok: true, entry, undo };
  }

  // ---------- the card ----------
  const fmt = C.fmt;
  const bars = (rows, total) => rows.filter((r) => r.tokens > 0).map((r) => el('div', { class: 'cc-line', title: r.hint || '' },
    el('span', { class: 'cc-l', text: r.label || r.name }), el('span', { class: 'cc-bar' }, el('i', { style: { width: `${Math.max(1, Math.min(100, total ? (r.tokens / total) * 100 : 0)).toFixed(1)}%` } })),
    el('b', { text: `≈ ${fmt(r.tokens)}` }), el('small', { text: `${r.share} %` })));
  let dlg = null;
  function fixRow(f) {
    const b = el('button', { type: 'button', class: 'primary small cc-go', text: f.button });
    const row = el('div', { class: 'cc-fix', title: f.why || '' },
      el('div', { class: 'cc-what' }, el('span', { text: f.text }), el('small', { text: `${f.share ? `${f.share} % of the week` : 'a week'} · estimated (hover: how)` })), b);
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await apply(f).catch((err) => ({ ok: false, error: err?.message || String(err) }));
      if (!r.ok) { b.disabled = false; toast(r.error || 'Not changed.', { timeout: 4000 }); return; }
      row.classList.add('done');
      const u = el('button', { type: 'button', class: 'ghost small cc-undo', text: 'Undo' });
      u.addEventListener('click', async () => { u.disabled = true; await r.undo(); row.classList.remove('done'); b.disabled = false; b.textContent = f.button; u.remove(); }, { once: true });
      b.textContent = '✓ Done';
      b.after(u);
      toast(`Done: ${f.button.toLowerCase()} (${H.agent(f.agentId)?.name || 'this AI'}), from its next message.`, { timeout: 7000, action: { label: 'Undo', fn: () => u.click() } });
    });
    return row;
  }
  async function open() {
    dlg?.close();
    const x = el('button', { type: 'button', class: 'ghost bud-x', text: '×', title: 'Close (Esc)', attrs: { 'aria-label': 'Close' }, on: { click: () => dlg?.close() } });
    const body = el('div', { class: 'cc-body' }, el('p', { class: 'opt-hint', text: 'Looking at the last 7 days…' }));
    const sub = el('span', { class: 'bud-sub', text: '' });
    dlg = el('dialog', { class: 'ui-modal cc-dlg', attrs: { 'aria-label': 'Cost coach' } }, el('div', { class: 'bud-head' }, el('h2', { text: '🧭 Cost coach' }), sub, el('span', { class: 'spacer' }), x), body);
    const d = dlg;
    dlg.addEventListener('close', () => { setTimeout(() => d.remove(), 0); if (dlg === d) dlg = null; });
    document.body.append(dlg);
    dlg.showModal();
    const res = await compute().catch(() => null);
    if (d !== dlg) return res;
    if (!res) { body.replaceChildren(el('p', { class: 'opt-hint', text: 'Couldn\'t read the chats just now. Try again in a moment.' })); return null; }
    paintBody(body, sub, res);
    return res;
  }
  function paintBody(body, sub, res) {
    sub.textContent = res.total ? `Last 7 days · ≈ ${fmt(res.total)} tokens · ${res.replies} replies · worked out here, 0 tokens` : 'Last 7 days · nothing used yet';
    const part = (title, ...kids) => (kids.flat().filter(Boolean).length ? el('section', { class: 'cc-part' }, el('h4', { text: title }), ...kids) : null);
    const where = el('details', { class: 'cc-where', open: res.top.length === 0 },
      el('summary', { text: 'Where it went' }),
      part('By AI', bars(res.byAI, res.total)),
      part('By kind of chat', bars(res.byKind, res.total)),
      part('By cause', bars(res.byCause, res.total)),
      res.overlays.length ? part('Also counted above', bars(res.overlays, res.total)) : null);
    body.replaceChildren(
      res.top.length ? part('The changes that would have saved the most', res.top.map(fixRow)) : el('p', { class: 'opt-hint cc-lean-all', text: res.total ? 'Nothing worth changing: this week is lean.' : 'Nothing used in the last 7 days.' }),
      res.lean.length ? part('Already lean', res.lean.slice(0, 6).map((l) => el('div', { class: 'cc-ok', text: l.text }))) : null,
      res.total ? where : null,
      el('p', { class: 'opt-hint cc-foot', text: 'Savings are estimates from this week\'s own numbers. Nothing changes until you click; Ctrl/⌘+Z or Undo takes a change back.' }));
  }

  // ---------- ⋯ AI setup › Spending: one line ----------
  function row() {
    const r = last();
    const sum = r ? (r.top.length ? `${r.top.length === 1 ? '1 change' : `${r.top.length} changes`} would save ≈ ${fmt(r.top.reduce((s, f) => s + f.saves, 0))} a week` : 'this week is lean') : 'where your tokens went, what to change';
    return el('div', { class: 'opt-row cc-row' },
      el('button', { type: 'button', class: 'ghost small cc-open', text: '🧭 Cost coach…', title: 'Where your tokens went in the last 7 days and the 3 changes that would save the most (worked out here, 0 tokens)', on: { click: () => open() } }),
      el('span', { class: 'opt-hint cc-sum', text: sum }));
  }

  // ---------- the weekly note (Hints: once a week, only when it pays) ----------
  let noting = null; // one offer at a time (Hints may hold it until a calm moment)
  function weekly(o) { noting ||= weeklyNow(o).finally(() => { noting = null; }); return noting; }
  async function weeklyNow({ now = Date.now() } = {}) {
    const s = await readStore();
    if (s.state === 'unreadable') return { skipped: 'store' };
    const wk = C.weekKey(now);
    if (s.value.noted[wk]) return { skipped: 'noted' };
    // (round 83, idleburst83) a week whose note wasn't due is looked at again at most once a day: the look reads every
    // chat changed in 7 days (2 min after EVERY start, then every 6 h, as long as the note stayed small)
    const seen = store.get('costcoach.small', null);
    if (seen?.wk === wk && now - (Number(seen.at) || 0) < 20 * 3600e3) return { skipped: 'small (looked at today)' };
    const res = await compute().catch(() => null);
    if (res && !res.note?.due) store.set('costcoach.small', { wk, at: now });
    if (!res?.note?.due) return { skipped: 'small' };
    const show = () => toast(res.note.text, { timeout: 12000, action: { label: 'See the fixes', fn: () => open() } });
    const shown = window.Hints ? await Hints.offer({ id: `costcoach:${wk}`, rank: 50, ttl: 30 * 60000, show }) : Boolean(show());
    if (shown) { s.value.noted[wk] = Date.now(); await saveStore(); }
    return { shown, text: res.note.text };
  }

  // ---------- ways in ----------
  if (typeof Commands !== 'undefined' && !Commands.get('cost-coach')) {
    Commands.register({
      name: 'cost-coach', aliases: Commands.get('coach') ? [] : ['coach'], area: 'Meter', args: '[open]',
      desc: 'Where your tokens went in the last 7 days (by AI, kind of chat, cause) and the 3 changes that would save the most; open: the card with one-click fixes',
      keywords: 'cost coach save saving tokens where went waste cheaper week fixes suggestions spending',
      examples: ['/cost-coach', '/cost-coach open'],
      complete: (q) => [{ value: 'open', hint: 'the card with the fixes' }].filter((x) => x.value.startsWith(String(q || '').toLowerCase())),
      run: async (args) => {
        if (/^open/i.test(String(args || '').trim())) { await open(); return null; }
        return C.words(await compute({ fresh: true }));
      },
    });
  }
  AppUI.addAction?.('Spending: cost coach — where your tokens went, what to change', () => open());
  readStore();
  const tick = () => { weekly().catch(() => {}); };
  if (window.Power?.every) Power.every('costcoach', 6 * 3600e3, tick, { first: 120000, hidden: 'skip' }); else setTimeout(tick, 120000);

  return { open, row, compute, apply, weekly, text: async () => C.words(await compute({ fresh: true })),
    _test: { readStore, saveStore, get mem() { return mem; }, reset: () => { cache = null; audits.clear(); } } };
})();
window.CostCoach = CostCoach;
