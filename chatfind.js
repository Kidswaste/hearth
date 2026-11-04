// (round 113, search113) "?word" in Ctrl/⌘+K: find it in any chat's messages, every project's, as you type.
// Lazy group "chatfind" (tier "use", with recall-core.js for the folding): loaded the first time a "?" is typed.
//   · the chats whose title has your words come first, at once, from the chats list this window already holds
//     (accents, case and the start of a word don't matter: "cafe" finds "Café plans", "intr" finds "Intro reel")
//   · the messages come from the store thread (storework.js op chatfind: recall's index, prefixes, every word, one row
//     per chat with the message to land on, its project) a moment after the last key: one ask in flight at a time, the
//     newest words win (an older answer never paints over a newer one); while the index is still reading chats
//     (left > 0) it asks again and the rows fill in
//   · each row says its project; Enter switches to that project (Projects.openChat: its conversation view) and lands on
//     the message, held in place while the chat settles (Native.jumpTo)
//   · a chat that can't be read just now is named in a row, never silently missing; a failed ask says so ("couldn't
//     search just now"), never "no messages match"
// Nothing here runs at startup and nothing is sent anywhere: it's this computer's own chats, matched here.
const ChatFind = (() => {
  const R = RecallCore;
  const QUIET = 70; // ms after the last key before the store thread is asked (the title rows don't wait)
  const S = { q: null, res: null, err: null, inFlight: false, again: false, seq: 0, timer: 0, onRows: null, stats: { asks: 0, lastMs: 0, maxMs: 0, firstRowsMs: 0, typedAt: 0, msgRowsMs: 0 } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const when = (t) => (t && typeof timeAgo === 'function' ? timeAgo(t) : '');

  // ---------- the chats whose title has every word (this window's list: instant) ----------
  let titles = null; // [chat, its folded title words] made once per H.chats list (it's replaced, never changed in place)
  let lastTitles = { q: null, list: null, proj: null, rows: [] }; // (the rows are drawn again as messages arrive: the same words, the same rows)
  function titleRows(q) {
    const words = R.foldWords(q).filter(Boolean);
    if (!words.length) return [];
    const proj = window.Projects?.isLoaded?.() ? 'p' : projOf.size;
    if (lastTitles.q === words.join(' ') && lastTitles.list === H.chats && lastTitles.proj === proj) return lastTitles.rows.slice();
    if (!titles || titles.list !== H.chats) { const ids = new Set(); titles = { list: H.chats, rows: (H.chats || []).filter((c) => H.agent(c.agentId) && !ids.has(c.id) && ids.add(c.id)).map((c) => [c, R.foldWords(c.title)]) }; } // (one row per chat: a .prev copy has its id)
    const hits = [];
    for (const [c, tw] of titles.rows) {
      if (!words.every((w) => tw.some((x) => x.startsWith(w)))) continue;
      const exact = tw.join(' ') === words.join(' ');
      hits.push({ c, s: (exact ? 4 : tw[0]?.startsWith(words[0]) ? 2 : 1) + (c.pinned ? 1.5 : 0) + Math.max(0, 1 - (Date.now() - (c.updatedAt || 0)) / (30 * 864e5)) });
    }
    hits.sort((a, b) => b.s - a.s);
    lastTitles = { q: words.join(' '), list: H.chats, proj, rows: hits.slice(0, 5).map(({ c }) => ({ kind: kindOf(projectOf(c.id), c), label: c.title || 'Chat', detail: c.pinned ? '📌 pinned' : when(c.updatedAt), chatId: c.id, run: () => go({ chatId: c.id, agentId: c.agentId, k: null }) })) };
    return lastTitles.rows.slice();
  }

  // a chat's project: the projects' own index when it's loaded, else what the store thread said about this chat
  const projOf = new Map(); // chat id → { id, name } | null, from the store thread's answers
  const projectOf = (id) => (window.Projects?.isLoaded?.() ? (() => { const p = Projects.projectOfChat(id); return p ? { id: p.id, name: p.name } : null; })() : projOf.get(id) || null);
  const kindOf = (p, c) => (p ? `◆ ${p.name}` : c ? `${H.agent(c.agentId)?.name || 'Chat'} chat` : 'Chat'); // (round 116, projchats116) every chat has a project (its name shows once the projects are read)

  // ---------- the messages (the store thread) ----------
  function rowOf(h) {
    const who = h.role === 'user' ? 'you' : h.role ? (H.agent(h.agentId)?.name || 'AI') : '';
    const detail = [h.title, who, when(h.at), h.count > 1 ? `${h.count} messages match` : ''].filter(Boolean).join(' · ');
    return { kind: kindOf(h.project), label: (h.snippet || h.title || 'Chat').replace(/\s+/g, ' ').trim().slice(0, 140), detail, chatId: h.chatId, hit: h, run: () => go(h) };
  }
  const note = (label, detail = '', run = () => {}) => ({ kind: 'Messages', label, detail, run, note: true });
  // the rows for "?<q>" now (titles at once, then what the store thread found for these words); onRows: called again
  // when more arrive while the box still shows these words
  function rows(q, onRows) {
    const t0 = performance.now();
    q = String(q || '');
    S.onRows = onRows;
    const words = q.trim();
    if (words !== S.q) { S.q = words; S.res = null; S.err = null; S.stats.typedAt = t0; ask(); }
    const out = titleRows(words);
    const seen = new Set(out.map((r) => r.chatId));
    if (S.res) {
      for (const h of S.res.hits) { const r = rowOf(h); if (seen.has(h.chatId) && h.k == null) continue; out.push(r); }
      for (const u of S.res.unread || []) out.push(note(`Couldn’t read ${u.title ? `“${u.title}”` : `a chat (${u.id})`} just now`, 'its messages aren’t in these results · try again in a moment', () => AppUI.palette(`?${S.q}`)));
      if (S.res.projects === null) out.push(note('Couldn’t read your projects just now', 'messages are found, but which project each is in isn’t shown'));
      if (S.res.left > 0 && !S.err) out.push(note(`Still reading ${S.res.left} chat${S.res.left === 1 ? '' : 's'}…`, 'more messages may appear here'));
    }
    if (S.err) out.push(note('Couldn’t search the messages just now', `${S.err} · Enter to try again`, () => AppUI.palette(`?${S.q}`))); // (the rows found before it stay)
    else if (!S.res && R.foldWords(words).some((w) => w.length >= 2)) out.push(note('Looking in your messages…'));
    S.stats.firstRowsMs = Math.round((performance.now() - t0) * 10) / 10;
    return out;
  }
  function ask() {
    clearTimeout(S.timer);
    S.timer = setTimeout(run, S.inFlight ? 0 : QUIET);
  }
  async function run() {
    if (S.inFlight) { S.again = true; return; }
    const q = S.q; const n = ++S.seq;
    if (!R.foldWords(q || '').some((w) => w.length >= 2)) { S.res = { hits: [], left: 0, unread: [] }; paint(); return; }
    S.inFlight = true;
    const t0 = performance.now(); let r = null; let err = null;
    // (still reading: a little more of the index per ask)
    try { r = await window.hub.chatFind({ q, budgetMs: S.res?.left > 0 ? 45 : 30, limit: 12 }); } catch (e) { err = e?.message || String(e); } finally { S.inFlight = false; }
    S.stats.asks += 1; S.stats.lastMs = Math.round(performance.now() - t0); S.stats.maxMs = Math.max(S.stats.maxMs, S.stats.lastMs);
    if (S.again) { S.again = false; run(); return; }
    if (n !== S.seq || q !== S.q) return; // (the words changed meanwhile: their own ask is on its way)
    if (r && !r.error) { S.res = r; S.err = null; if (r.projects !== null) for (const h of r.hits) projOf.set(h.chatId, h.project || null); S.stats.msgRowsMs = Math.round(performance.now() - S.stats.typedAt); } else { S.err = calmText(err || r?.error); }
    paint();
    // still reading chats: ask again in a quiet moment, the rows fill in
    if (r && r.left > 0) { await idle(); if (q === S.q && n === S.seq) run(); }
  }
  const calmText = (e) => (typeof calmError === 'function' ? calmError(e) : String(e || 'the store didn’t answer'));
  const idle = () => new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(res, { timeout: 80 }) : setTimeout(res, 30)));
  function paint() { try { S.onRows?.(); } catch { /* the palette closed */ } }

  // ---------- opening one: its project, its chat, the message ----------
  const go = (h) => open(h).catch((e) => toast(calmText(e), { type: 'error', raw: e }));
  async function open(h) {
    const a = H.agent(h.agentId);
    if (!a) throw new Error('That chat’s AI isn’t here any more');
    if (!(H.chats || []).some((c) => c.id === h.chatId)) { toast('That chat is gone (it may have been deleted since)', { type: 'error' }); return false; }
    // Projects.openChat: a project's chat opens in its project's conversation view (the project switched to), any other
    // as before (its AI, its dock)
    let done = false;
    try { if (window.Lazy && !Lazy.isIn('projects')) await Lazy.load('projects'); await Projects.ready(); done = await Projects.openChat(h.chatId); } catch (e) { console.warn('find: projects', e); }
    if (!done) { if (a.dock) Tools.openDock?.(a.dock); else activate(a.id); Native.open(a.id, h.chatId); }
    if (h.k == null) return true;
    for (let i = 0; i < 50; i++) {
      if (H.activeChat[a.id] === h.chatId && Native.jumpTo(a.id, h.k)) return true;
      await sleep(100);
    }
    return false;
  }

  return { rows, open, titleRows, state: () => ({ q: S.q, res: S.res, err: S.err, inFlight: S.inFlight, stats: { ...S.stats } }), _S: S };
})();
window.ChatFind = ChatFind;
