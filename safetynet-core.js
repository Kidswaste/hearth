// Hearth never loses work (round 29, safetynet), as data: no DOM, no app, so it runs in Node too
// (dev/safetynet-test.js). safetynetmain.js keeps the session marker and the journal file; safetynet.js fills the
// journal while you work and, after an unexpected exit, uses the plans here to decide what comes back and how.
//   session  start(prev, now) → { unclean, marker }: the marker the last run left says whether it ended cleanly
//   journal  { v, at, entries: { key: entry } }, written a moment after you type / drag / send (never per keystroke):
//              lab    { k: 'lab', id, name, at, state: the time machine's state (layers + code, unsaved sliders) }
//              draft  { k: 'draft', agentId, chatId, title, text, queue: [queued messages], at }
//              board  { k: 'board', id, name, updated, items: items without their big inline pictures }
//              field  { k: 'field', where, text, at }: a text box you were typing in that wasn't saved yet (AI setup…)
//   plans    what to do with each entry against what is on disk now; the rule everywhere: nothing comes back over
//            newer data (a newer save wins), and nothing is overwritten (Lab work comes back as a time-machine version,
//            a draft only fills an empty box or one holding the start of it, a text box becomes a note)
const SafetyNetCore = (() => {
  const V = 1;
  const BIG = 2000; // inline data (a data: URL) longer than this stays out of the journal: the board has it on disk
  const sig = (x) => JSON.stringify(x ?? null);
  const clean = (s) => String(s || '').replace(/\s+$/, '');

  // ---------- session ----------
  // prev: the marker on disk ({ pid, started, clean, ... }) or null on a first start
  function start(prev, now = Date.now(), pid = 0) {
    const unclean = prev && prev.clean === false ? { kind: 'process', at: prev.beat || prev.started || null, started: prev.started || null, reason: 'Hearth was closed without saying goodbye (a crash, a forced quit or the computer turning off)' } : null;
    return { unclean, marker: { v: V, pid, started: now, beat: now, clean: false } };
  }
  const page = (reason, now = Date.now()) => ({ kind: 'page', at: now, reason: `the window's page stopped (${reason || 'crashed'})` });
  // a crash loop: the page reloads after a crash, unless it crashed 3 times in 2 minutes
  function shouldReload(crashTimes, now = Date.now()) { return crashTimes.filter((t) => now - t < 120e3).length < 3; }

  // ---------- the Lab ----------
  // the layers a saved sketch has (an old one without layers is one layer 'main' = its code)
  const layersOf = (s) => (Array.isArray(s?.layers) && s.layers.length ? s.layers : s ? [{ id: 'main', code: s.code || '' }] : []);
  const PROPS = ['visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate', 'keys', 'name'];
  // entry: a lab entry; saved: the sketch as kv three-sketches has it now (null: deleted) →
  //   { action: 'none' | 'version' | 'gone', what: ['code', 'sliders', 'layers', 'keyframes'], why }
  function labPlan(entry, saved) {
    if (!entry?.state?.layers?.length) return { action: 'none', what: [], why: 'empty' };
    if (!saved) return { action: 'gone', what: [], why: 'the scene was deleted' };
    if ((saved.updatedAt || 0) > (entry.at || 0) + 500) return { action: 'none', what: [], why: 'saved later' };
    const what = new Set();
    const have = new Map(layersOf(saved).map((L) => [L.id, L]));
    for (const L of entry.state.layers) {
      const S = have.get(L.id);
      if (!S) { what.add('layers'); continue; }
      if (clean(S.code) !== clean(L.code)) what.add('code');
      for (const p of PROPS) {
        if (sig(S[p]) === sig(L[p]) || (S[p] == null && L[p] == null)) continue;
        what.add(p === 'keys' ? 'keyframes' : 'layers');
      }
    }
    if (entry.state.layers.length !== have.size) what.add('layers');
    if (entry.state.vals && Object.values(entry.state.vals).some((v) => v && Object.keys(v).length)) what.add('sliders');
    return what.size ? { action: 'version', what: [...what], why: 'not saved yet' } : { action: 'none', what: [], why: 'same as saved' };
  }
  const WORD = { code: 'code', sliders: 'slider moves', layers: 'layer changes', keyframes: 'keyframes' };
  const labWords = (what) => {
    const w = (what || []).map((x) => WORD[x] || x);
    return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0] || 'changes';
  };

  // ---------- chat drafts and queued messages ----------
  // entry: a draft entry; stored: the draft the chat box keeps (localStorage) now; sent: the texts of the chat's last
  // messages from you (a draft or a queued message you did send isn't brought back) →
  //   { text: what the box should hold, or null to leave it, came: 'restored' | 'kept' | 'none', queued: n }
  function draftPlan(entry, stored, sent = []) {
    const was = new Set(sent.map((t) => clean(t).trim()));
    const fresh = (t) => Boolean(clean(t).trim()) && !was.has(clean(t).trim());
    stored = clean(stored);
    const text = fresh(entry?.text) ? clean(entry.text) : '';
    const queue = (entry?.queue || []).filter(fresh).map(clean);
    let base = stored; let came = 'none';
    if (text) {
      if (text === stored) came = 'kept';
      else if (!stored || text.startsWith(stored)) { base = text; came = 'restored'; }
      // else: the box holds something else, newer: it stays
    }
    const extra = queue.filter((q) => !base.includes(q));
    if (extra.length) { base = [base, ...extra].filter(Boolean).join('\n\n'); came = 'restored'; }
    return { text: base !== stored ? base : null, came, queued: extra.length };
  }

  // ---------- the board ----------
  // an item for the journal: big inline pictures (data: URLs) are left out, their names noted in _cut
  function stripItem(it) {
    const out = {}; const cut = [];
    for (const [k, v] of Object.entries(it || {})) { if (typeof v === 'string' && v.length > BIG && v.startsWith('data:')) cut.push(k); else out[k] = v; }
    if (cut.length) out._cut = cut;
    return out;
  }
  // entry: a board entry; saved: the board as kv board-<id> has it now →
  //   { action: 'none' | 'merge' | 'gone', items, changed, added }; items changed or added after the last save come
  //   back (an item whose picture was left out comes back only if the board still has it); deletes are not replayed
  function boardPlan(entry, saved) {
    if (!entry?.items) return { action: 'none', items: null, changed: 0, added: 0 };
    if (!saved) return { action: 'gone', items: null, changed: 0, added: 0 };
    if ((saved.updated || 0) >= (entry.updated || 0)) return { action: 'none', items: null, changed: 0, added: 0 };
    const items = (saved.items || []).map((x) => ({ ...x }));
    const byId = new Map(items.map((x, i) => [x.id, i]));
    let changed = 0; let added = 0;
    for (const e of entry.items) {
      const { _cut: cut = [], ...rest } = e;
      const i = byId.get(e.id);
      if (i != null) {
        const merged = { ...items[i], ...rest };
        if (sig(merged) !== sig(items[i])) { items[i] = merged; changed += 1; }
      } else if (!cut.length) { items.push(rest); byId.set(e.id, items.length - 1); added += 1; }
    }
    return changed || added ? { action: 'merge', items, changed, added } : { action: 'none', items: null, changed: 0, added: 0 };
  }

  // ---------- text boxes (AI setup, a dialog…) ----------
  // what you were typing becomes a note (never typed back into a form that may have changed since)
  function fieldPlan(entry, notes = []) {
    const text = clean(entry?.text);
    if (text.trim().length < 3) return null;
    if (notes.some((n) => clean(n.text).includes(text))) return null; // already a note (a reload during the restore)
    const where = String(entry.where || 'a text box').slice(0, 60);
    return { title: `Recovered: ${where}`, text: `# Recovered: ${where}\n\n${text}\n` };
  }

  // ---------- the journal ----------
  const empty = () => ({ v: V, at: 0, entries: {} });
  function valid(j) { return Boolean(j && typeof j === 'object' && j.entries && typeof j.entries === 'object'); }
  // the entries in the order they come back on the card: Lab, drafts, boards, text boxes; newest first in each
  const ORDER = { lab: 0, draft: 1, board: 2, field: 3 };
  function entries(j) {
    if (!valid(j)) return [];
    return Object.entries(j.entries).map(([key, e]) => ({ key, ...e })).filter((e) => e.k in ORDER)
      .sort((a, b) => ORDER[a.k] - ORDER[b.k] || (b.at || b.updated || 0) - (a.at || a.updated || 0));
  }
  // the card's title and an empty-handed line
  const TITLE = 'Hearth closed unexpectedly — here\'s what was restored';
  const NOTHING = 'Hearth closed unexpectedly — nothing was lost.';

  return { V, BIG, sig, start, page, shouldReload, layersOf, labPlan, labWords, draftPlan, stripItem, boardPlan, fieldPlan, empty, valid, entries, TITLE, NOTHING };
})();
if (typeof module !== 'undefined') module.exports = SafetyNetCore;
