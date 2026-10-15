// 💡 Answered by Hearth (round 45, localanswers): a question about Hearth itself ("how do I make a 9:16 version?",
// "where's the spending limit?", "what changed today?") is answered here, for free, instead of costing a whole AI turn.
// native.js asks gate() right before a plain chat message is sent (no attachments, no mission, no command):
//   · null      → it is sent as always (most messages: the cheap shape check in localanswers-core.js says no at once)
//   · a promise → resolves false: sent as always · true: a small card shows above the chat box instead of sending:
//     the answer in one or two plain lines, Show me (jumps there: the Settings / AI setup row lit, the Lab's own row run,
//     the chat menu opened, the patch notes on that round), Ask the AI anyway (one click sends it as normal), ×
// Never for the owner's own work (code, scenes, writing: the core's rules); in a Lab director chat only questions about
// the Lab's UI; off per AI in ⋯ AI setup › Habits ("Answer questions about Hearth itself, for free", agent.localAnswers).
// Learns from misses: "Ask the AI anyway" (or Enter again on the same words) adds the question's words to kv
// local-answers (read with its status, never saved over a file that couldn't be read: datasafe), and they stop
// triggering. The answers come from Find anything's and Lab search's catalogs (appsearch-data.js,
// tools/three-search-core.js; their groups load the first time a question-shaped message is sent) and the patch notes
// (whatsnew-core.js). 0 tokens, nothing added to any prompt. /hearth-answer <question> says what Hearth would answer.
const LocalAnswers = (() => {
  const K = LocalAnswersCore;
  const KV = 'local-answers';
  const MAX_MISSES = 300;
  const stats = { checked: 0, shown: 0, asked: 0, shows: 0, sent: 0, last: null, ms: 0 };
  let built = null; let notes = null;
  let misses = new Set(); let missList = []; let readState = null; // 'ok' | 'missing' | 'unreadable'
  let card = null; // { agentId, text, el, input, form, ans }
  let skip = null; // the words "Ask the AI anyway" lets through once
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const end = Date.now() + ms; for (;;) { let v = null; try { v = fn(); } catch { /* not yet */ } if (v) return v; if (Date.now() > end) return null; await sleep(80); } };

  // ---------- what it learned (kv local-answers: { misses: [{ k, at }] }) ----------
  let loading = null;
  function loadMisses() {
    return (loading ||= (async () => {
      try {
        const r = await window.hub.kvGet(KV, null, { status: true });
        readState = r?.state || 'unreadable';
        const v = r?.state === 'ok' ? r.value : r?.state === 'unreadable' ? r.prev : null;
        missList = Array.isArray(v?.misses) ? v.misses.filter((m) => m && typeof m.k === 'string') : [];
      } catch { readState = 'unreadable'; missList = []; }
      misses = new Set(missList.map((m) => m.k));
    })());
  }
  async function saveMisses() {
    await loadMisses();
    // (datasafe) a file that couldn't be read is never written over: the miss stays for this session, saved once it reads
    if (readState === 'unreadable') { loading = null; await loadMisses(); if (readState === 'unreadable') return false; }
    try { await window.hub.kvSet(KV, { misses: missList.slice(-MAX_MISSES) }); return true; } catch { return false; }
  }
  async function learn(key) {
    if (!key) return;
    await loadMisses();
    if (!misses.has(key)) { misses.add(key); missList.push({ k: key, at: Date.now() }); }
    await saveMisses();
  }
  async function forget() { await loadMisses(); const n = missList.length; missList = []; misses = new Set(); await saveMisses(); return n; }

  // ---------- the answers ----------
  async function ready({ withNews = false } = {}) {
    if (!built) {
      if (window.Lazy && !Lazy.isIn('appsearch')) await Lazy.load('appsearch');
      built = K.build({ C: LabSearchCore, D: AppSearchData });
    }
    await loadMisses();
    if (withNews && !notes) {
      if (window.Lazy && !Lazy.isIn('whatsnew')) await Lazy.load('whatsnew').catch(() => {});
      try {
        const idx = (await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).split('\n').map((l) => l.trim()).filter((l) => /^round-\d+\.md$/.test(l)).slice(0, 3);
        notes = (await Promise.all(idx.map(async (f) => ({ round: Number(/\d+/.exec(f)[0]), text: await fetch(`docs/patch-notes/${f}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '') })))).filter((n) => n.text);
      } catch { notes = []; }
    }
  }
  const isDirector = (a) => Boolean(a?.dock);
  // find(agentId, text) → the answer, or null (after ready())
  function find(agentId, text) {
    const a = H.agent(agentId);
    const sh = K.shape(text);
    if (!sh) return null;
    if (sh.news) return isDirector(a) ? null : K.news(notes || [], text, { misses });
    return K.answer(built, text, { director: isDirector(a), misses });
  }
  const enabled = (a) => Boolean(a) && a.mode === 'native' && a.localAnswers !== false;

  // ---------- the gate (native.js, right before a plain message is sent) ----------
  // gate(agentId, text, { form, input }) → null (send it) | Promise<boolean> (true: answered here, not sent)
  function gate(agentId, text, { form, input } = {}) {
    if (skip && skip === text) { skip = null; return null; }
    const a = H.agent(agentId);
    if (!enabled(a)) return null;
    // Enter again on the same words while its card shows: that's "Ask the AI anyway"
    if (card && card.agentId === agentId && card.text === text) { askAnyway({ submit: false }); return null; }
    const sh = K.shape(text);
    if (!sh) return null;
    return (async () => {
      const t0 = performance.now();
      try { await ready({ withNews: sh.news }); } catch (err) { console.warn('local answers', err); return false; }
      stats.checked += 1;
      const ans = find(agentId, text);
      stats.ms = Math.round((performance.now() - t0) * 10) / 10;
      stats.last = ans ? { q: text, id: ans.id, title: ans.title } : { q: text, id: null };
      if (!ans) return false;
      if (!input || input.value.trim() !== text || !form?.isConnected) return false; // typed on meanwhile: as usual
      show(agentId, text, ans, { form, input });
      return true;
    })();
  }

  // ---------- the card ----------
  function hide() {
    if (!card) return;
    card.input?.removeEventListener('input', card.onInput);
    card.el.remove();
    card = null;
  }
  const goTitle = (g) => ({ set: 'Opens Settings on it', ai: 'Opens ⋯ AI setup on it', lab: 'Opens the Lab on it', menu: 'Opens that menu', tool: 'Opens it', news: 'Opens the patch notes', palette: 'Opens Find anything', mission: 'Sets it for your next message' }[g?.type] || 'Shows you where');
  function show(agentId, text, ans, { form, input }) {
    hide();
    const showBtn = ans.go ? el('button', { type: 'button', class: 'small la-show', text: 'Show me', title: goTitle(ans.go), on: { click: () => showMe() } }) : null;
    const node = el('div', { class: 'la-card', attrs: { role: 'status', 'aria-label': 'Answered by Hearth' }, dataset: { id: ans.id } },
      el('div', { class: 'la-head' },
        el('span', { class: 'la-mark', text: '💡 Answered by Hearth' }),
        el('span', { class: 'la-free', text: 'free · not sent', title: 'Hearth answered this from its own help: no AI turn, no tokens' }),
        el('button', { type: 'button', class: 'ghost la-x', text: '×', title: 'Close (your words stay in the box)', attrs: { 'aria-label': 'Close' }, on: { click: () => hide() } })),
      el('div', { class: 'la-text', text: typeof WinMac !== 'undefined' && WinMac.keyWords ? WinMac.keyWords(ans.text) : ans.text }), // (round 46) ⌘K on the Mac, Ctrl+K on Windows
      el('div', { class: 'la-acts' }, showBtn,
        el('button', { type: 'button', class: 'ghost small la-ask', text: 'Ask the AI anyway', title: 'Sends your message as usual (and Hearth won\'t answer these words again)', on: { click: () => askAnyway() } })));
    form.before(node);
    const onInput = () => { if (input.value.trim() !== text) hide(); };
    input.addEventListener('input', onInput);
    card = { agentId, text, el: node, input, form, ans, onInput };
    stats.shown += 1;
    if (typeof Usage !== 'undefined') Usage.track?.('Chat › Answered by Hearth', { area: 'Chat', label: 'Answered by Hearth' });
  }
  async function askAnyway({ submit = true } = {}) {
    if (!card) return;
    const { text, form, ans } = card;
    hide();
    stats.asked += 1;
    learn(ans.key).catch(() => {});
    if (!submit) return;
    skip = text;
    stats.sent += 1;
    form.requestSubmit();
  }
  async function showMe() {
    if (!card) return;
    const { ans, input, agentId } = card;
    hide();
    stats.shows += 1;
    // answered: the question leaves the box
    if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    try { await go(ans.go, agentId); } catch (err) { toast(err?.message || String(err), { type: 'error', timeout: 4000 }); }
  }
  async function go(g, agentId) {
    if (!g) return null;
    if (g.type === 'set' || g.type === 'ai') {
      if (window.Lazy && !Lazy.isIn('appsearch')) await Lazy.load('appsearch');
      const rec = [...AppSearchData.SETTINGS, ...AppSearchData.AI_SETUP].find((r) => r.id === g.id);
      if (!rec) throw new Error('That place moved: try Ctrl/⌘+K');
      return g.type === 'set' ? AppSearch.toSettings(rec) : AppSearch.toAiSetup(rec);
    }
    if (g.type === 'lab') {
      if (typeof ThreeLab !== 'undefined' && ThreeLab.cmd) await ThreeLab.cmd({ show: true }); else activate('tool:three');
      await until(() => H.surfaceIdFor?.(H.activeId) === 'tool:three', 8000);
      if (window.Lazy && !Lazy.isIn('labsearch')) await Lazy.load('labsearch');
      if (g.label && typeof LabSearch !== 'undefined') {
        LabSearch.buildIndex();
        const ix = LabSearch.index;
        const row = [...(ix.live?.items || []), ...(ix.fixed?.items || [])].find((it) => it.kind === 'action' && it.label === g.label && typeof it.run === 'function');
        if (row) { stats.ran = g.label; return row.run(); }
      }
      return LabSearchHook.open({ query: (g.label || g.q || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/…$/, '') });
    }
    if (g.type === 'menu') {
      const n = document.querySelector(g.sel);
      if (!n) throw new Error('Open a chat first');
      const r = n.getBoundingClientRect();
      n.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(r.width / 2, 60), clientY: r.top + Math.min(r.height / 2, 14), button: 2 }));
      return true;
    }
    if (g.type === 'tool') { activate(`tool:${g.id}`); return true; }
    if (g.type === 'palette') { AppUI.palette?.(); return true; }
    if (g.type === 'mission') { if (typeof Missions !== 'undefined') Missions.set(agentId, g.id); return true; }
    if (g.type === 'news') {
      if (typeof WhatsNew !== 'undefined' && WhatsNew.fullNotes) return WhatsNew.fullNotes(g.round, g.part);
      return typeof Updater !== 'undefined' ? Updater.patchNotes(g.round ? `round-${g.round}.md` : undefined) : null;
    }
    return null;
  }

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get('hearth-answer')) {
    Commands.register({
      name: 'hearth-answer', area: 'Chat', args: '<question> | forget',
      desc: 'What Hearth itself answers to a question about the app, for free (no AI turn); "forget" lets the questions you asked the AI anyway be answered again',
      keywords: 'answered by hearth local answer help how do i where is free question about hearth',
      examples: ['/hearth-answer how do I make a 9:16 version?', '/hearth-answer forget'],
      async run(args, ctx = {}) {
        const q = String(args || '').trim();
        if (/^forget$/i.test(q)) { const n = await forget(); return n ? `Forgot ${n} question${n === 1 ? '' : 's'}: Hearth answers them again.` : 'Nothing to forget.'; }
        if (!q) return 'Ask it a question about Hearth: /hearth-answer where is the spending limit?';
        await ready({ withNews: Boolean(K.shape(q)?.news) });
        const a = find(ctx.agentId || H.claudeAgent?.()?.id, q.endsWith('?') ? q : `${q}?`);
        return a ? a.text : 'Hearth has no answer of its own for that: ask the AI.';
      },
    });
  }

  return { gate, find, ready, hide, askAnyway, showMe, go, learn, forget, enabled, stats, get card() { return card; }, get misses() { return [...misses]; } };
})();
window.LocalAnswers = LocalAnswers;
