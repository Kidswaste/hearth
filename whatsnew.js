// ✦ Since you were away (round 42, whatsnew). Hearth gets several rounds a day; the owner updates now and then and
// used to face the patch notes of many rounds at once. After an update that brings two rounds or more, ONE calm card
// replaces the "Hearth updated" note: the top changes of every missed round (≈ 12 lines, grouped Lab · Chats & AIs ·
// Saving tokens · Mac & Windows · Everywhere · Fixes), each one plain line, ▸ Show me where a feature has a place
// (Find anything's places: a Settings row, an ⋯ AI setup row, the Lab's own search), "and N more", Read the full notes
// (the per-round reader, patchnotes.js, unchanged) and ↶ Go back. Built here from docs/patch-notes/round-NN.md
// (whatsnew-core.js), 0 tokens: nothing is sent, nothing is added to a prompt.
//   · which rounds were seen is remembered on this computer (store whatsnew.seen: the newest round shown here)
//   · it goes through Hints as the after-update note (hintcalm: the patch notes first; updater.js asks for it), and
//     the ✦ What's new card that used to come next stays away for that update (one digest, not a pile)
//   · Hearth updated some other way (a git pull by hand)? On the next start it comes once, the same way
//   · any time: Settings › Updates & what's new › What's new… › Since you were away, Ctrl/⌘+K, or /since-away
// Lazy group "whatsnew" (tier "use"): loaded when one of those asks for it.
const WhatsNew = (() => {
  const C = WhatsNewCore;
  const SEEN = 'whatsnew.seen'; // the newest round this computer has shown (store = this computer's own)
  const LAST = 'whatsnew.last'; // { from, to, at }: the last digest shown (Settings shows it again when nothing is new)
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const set = (k, v) => { try { store.set(k, v); } catch { /* storage is a convenience */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const end = Date.now() + ms; for (;;) { let v = null; try { v = fn(); } catch { /* not yet */ } if (v) return v; if (Date.now() > end) return null; await sleep(80); } };
  let covered = 0; // the update (its time) a digest stood in for: the ✦ What's new card stays away for it
  const stats = { built: 0, shown: 0, jumps: [], ms: 0 };

  // ---------- the notes on disk ----------
  async function readText(p) { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); }
  async function rounds() {
    try {
      return (await readText('docs/patch-notes/index.txt')).split('\n').map((l) => (/^round-(\d+)\.md$/.exec(l.trim()) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
    } catch { return []; }
  }
  const seen = () => { const v = get(SEEN, null); return v == null ? null : Number(v) || 0; };
  function markSeen(n) { if (n && !(seen() >= n)) set(SEEN, n); }
  // build({ since }) → the digest of every round after `since` (default: what this computer saw)
  async function build({ since = seen() ?? 0 } = {}) {
    const t0 = performance.now();
    const list = await rounds();
    const want = list.filter((r) => r > since);
    const input = await Promise.all(want.map(async (round) => ({ round, text: await readText(`docs/patch-notes/round-${round}.md`).catch(() => '') })));
    const d = C.digest(input, { seen: since });
    d.newest = list.at(-1) || 0;
    d.since = since;
    stats.built += 1; stats.ms = Math.round(performance.now() - t0);
    return d;
  }
  const span = (d) => (d.from === d.to ? `round ${d.to}` : `rounds ${d.from}–${d.to}`);
  const nRounds = (d) => d.rounds.length;

  // ---------- Show me (Find anything's places) ----------
  const closeAll = () => { closeCard(); document.querySelector('dialog.wn-dialog[open]')?.close(); };
  async function showMe(go) {
    closeAll();
    stats.jumps.push({ type: go.type, id: go.rec?.id || go.q || '' });
    if (go.type === 'set' || go.type === 'ai') {
      if (window.Lazy && !Lazy.isIn('appsearch')) await Lazy.load('appsearch');
      return go.type === 'set' ? AppSearch.toSettings(go.rec) : AppSearch.toAiSetup(go.rec);
    }
    if (go.type === 'palette') { AppUI.palette?.(); return true; }
    if (go.type === 'lab') {
      activate('tool:three');
      await until(() => typeof LabSearchHook !== 'undefined' && H.surfaceIdFor?.(H.activeId) === 'tool:three', 8000);
      return LabSearchHook.open({ query: go.q });
    }
    return null;
  }
  // the full notes: the per-round reader, on that round's part when there is one
  async function fullNotes(round, part) {
    closeAll();
    const file = round ? `round-${round}.md` : undefined;
    await (typeof Updater !== 'undefined' ? Updater.patchNotes(file) : Promise.resolve());
    if (!part) return;
    const h = await until(() => [...document.querySelectorAll('dialog.pn-dialog .pn-body :is(h2, h3, h4, h5)')].find((x) => x.textContent.includes(part)), 4000);
    h?.scrollIntoView({ block: 'start' });
  }

  // ---------- the lines ----------
  function row(it) {
    const go = C.goFor(it, typeof AppSearchData !== 'undefined' ? AppSearchData : null);
    const line = el('span', { class: 'wn-text' });
    if (it.kind === 'feature' && it.name) line.append(el('b', { text: it.name }), it.line ? ` — ${it.line}` : '');
    else line.textContent = C.text(it);
    return el('li', { class: `wn-row wn-${it.kind}`, dataset: { round: it.round, group: it.group }, title: `Round ${it.round}${it.fixedIn ? ` (better again in ${it.fixedIn.join(', ')})` : ''}${it.where ? ` · ${it.where}` : ''}` },
      line,
      go ? el('button', { type: 'button', class: 'ghost small wn-show', text: 'Show me', title: go.type === 'lab' ? `Opens the Lab's search on "${go.q}"` : go.type === 'palette' ? 'Opens Find anything' : `Opens ${go.rec?.path || 'Settings'} on it`, on: { click: () => showMe(go).catch((err) => toast(err.message, { type: 'error', timeout: 4000 })) } }) : null);
  }
  function groups(list) {
    return list.map((g) => el('section', { class: 'wn-group', dataset: { group: g.id } },
      el('h4', { class: 'wn-gh' }, el('span', { class: 'wn-gi', text: g.icon, attrs: { 'aria-hidden': 'true' } }), g.label),
      el('ul', { class: 'wn-list' }, g.items.map(row))));
  }
  // the digest's body: the groups, then "and N more" (opens the rest in place)
  function body(d) {
    const box = el('div', { class: 'wn-body' }, groups(d.groups));
    if (d.more) {
      const more = el('button', { type: 'button', class: 'ghost small wn-more', text: `and ${d.more} more`, title: 'The other changes of these rounds, one line each' });
      more.addEventListener('click', () => { more.replaceWith(el('div', { class: 'wn-rest' }, groups(d.rest))); });
      box.append(more);
    }
    return box;
  }
  const lead = (d, j) => `${j ? 'Hearth updated: ' : ''}${nRounds(d) > 1 ? `${nRounds(d)} rounds of changes (${span(d).replace(/^rounds /, '')})` : `Round ${d.to}`}: the ones worth knowing, in one place.`;

  // ---------- the after-update card (bottom left, like the pick-up card; one at a time through Hints) ----------
  let cardEl = null; let hideT = 0;
  function closeCard() { clearTimeout(hideT); if (!cardEl) return; const c = cardEl; cardEl = null; c.classList.add('out'); setTimeout(() => c.remove(), 160); }
  function card(d, j, { goBack } = {}) {
    closeCard();
    const foot = el('div', { class: 'wn-foot' },
      el('button', { type: 'button', class: 'small primary wn-full', text: 'Read the full notes', on: { click: () => fullNotes(d.to) } }),
      j && goBack ? el('button', { type: 'button', class: 'ghost small up-back', text: '↶ Go back', title: `Go back to the version before this update (${j.from}): your chats and data stay`, on: { click: () => { closeCard(); goBack(); } } }) : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost small wn-big', text: '⤢', title: 'Open it bigger', attrs: { 'aria-label': 'Open it bigger' }, on: { click: () => { closeCard(); open({ since: d.since }); } } }));
    cardEl = el('div', { class: 'speed-card wn-card', role: 'dialog', attrs: { 'aria-label': 'Since you were away', 'data-no-usage': '' } },
      el('div', { class: 'sr-head' }, el('b', { text: '✦ Since you were away' }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'sr-x', text: '×', title: 'Close', attrs: { 'aria-label': 'Close' }, on: { click: () => closeCard() } })),
      el('p', { class: 'wn-lead', text: lead(d, j) }),
      body(d), foot);
    // it stays until it's closed while the pointer is on it, then goes by itself after a minute and a half
    const arm = () => { clearTimeout(hideT); hideT = setTimeout(closeCard, 90000); };
    cardEl.addEventListener('mouseenter', () => clearTimeout(hideT));
    cardEl.addEventListener('mouseleave', arm);
    document.body.append(cardEl);
    arm();
    tryRow(d, cardEl.querySelector('.wn-body'));
    return cardEl;
  }
  // (round 64, newtour64) ✦ Try what's new: a Try it per round (61–63) and "7 of 13 tried" above the lines (trynew.js, its own group)
  function tryRow(d, before) {
    if (!before || !(d.rounds || []).some((r) => r >= 61 && r <= 63) || !window.Lazy) return;
    Lazy.load('trynew').then(() => { const row = window.TryNew?.whatsNewRow(d.rounds); if (row && before.isConnected) before.before(row); }).catch(() => {});
  }
  function shown(d) {
    markSeen(Math.max(d.to, d.newest || 0));
    set(LAST, { from: d.from, to: d.to, at: Date.now() });
    stats.shown += 1;
  }

  // ---------- the dialog (Settings, Ctrl/⌘+K, the card's ⤢) ----------
  // open({ since }): what's new since `since`, else since what this computer saw; nothing new → the last digest again
  async function open({ since } = {}) {
    let d = await build({ since: since ?? seen() ?? 0 });
    if (!d.shown) { const l = get(LAST, null); const list = await rounds(); d = await build({ since: l?.from ? l.from - 1 : Math.max(0, (list.at(-3) || 1) - 1) }); }
    document.querySelector('dialog.wn-dialog')?.close();
    if (!d.shown) { toast('No patch notes in this copy yet.', { timeout: 2500 }); return null; }
    const dlg = el('dialog', { class: 'ui-modal wn-dialog', attrs: { 'aria-label': 'Since you were away' } },
      el('div', { class: 'wn-dhead' }, el('h2', { text: '✦ Since you were away' }), el('span', { class: 'spacer' }), el('span', { class: 'hint', text: span(d) })),
      el('p', { class: 'wn-lead', text: lead(d) }),
      el('div', { class: 'wn-scroll' }, body(d)),
      el('div', { class: 'modal-buttons' },
        el('button', { type: 'button', class: 'ghost wn-full', text: 'Read the full notes', on: { click: () => fullNotes(d.to) } }),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'primary', text: 'Done', autofocus: true, on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    shown(d);
    tryRow(d, dlg.querySelector('.wn-scroll'));
    return dlg;
  }

  // ---------- after an update (updater.js asks, inside its Hints offer: the first note) ----------
  // → the card when the update brought two rounds or more; null → the usual "Hearth updated" note (one round)
  async function afterUpdate(j, { goBack } = {}) {
    const list = await rounds();
    const newest = list.at(-1) || 0;
    let s = seen();
    if (s == null) { // not remembered yet: the rounds whose notes this update brought
      const got = (j?.files || []).map((f) => Number((/^docs\/patch-notes\/round-(\d+)\.md$/.exec(f) || [])[1]) || 0).filter(Boolean);
      if (got.length) s = Math.min(...got) - 1;
    }
    if (s == null || list.filter((r) => r > s).length < 2) { markSeen(newest); return null; }
    const d = await build({ since: s });
    if (!d.shown) { markSeen(newest); return null; }
    covered = j?.at || Date.now();
    const node = card(d, j, { goBack });
    shown(d);
    return node;
  }
  // Hearth updated some other way: once, through the queue, as a notice (it's about this copy, like the update note)
  async function atStart() {
    const list = await rounds();
    const newest = list.at(-1) || 0;
    const s = seen();
    if (s == null) { markSeen(newest); return false; }
    if (newest <= s) return false;
    const show = async () => { const d = await build({ since: s }); if (!d.shown) { markSeen(newest); return null; } const node = card(d, null); shown(d); return node; };
    return window.Hints ? Hints.offer({ id: `whatsnew:${newest}`, kind: 'notice', rank: 1, ttl: 20 * 60000, show }) : Boolean(await show());
  }
  const covers = (at) => Boolean(at && covered === at);

  // ---------- ways in: Ctrl/⌘+K, /since-away ----------
  if (typeof Commands !== 'undefined' && !Commands.get('since-away')) {
    Commands.register({
      name: 'since-away', area: 'App', args: '[round]', aliases: Commands.get('catch-up') ? [] : ['catch-up'],
      desc: 'Since you were away: the top changes of every round you missed, in one page (Show me, the full notes)',
      keywords: 'whats new patch notes changes digest summary missed rounds update catch up',
      examples: ['/since-away', '/since-away 33'],
      run: async (args) => { const n = Number(String(args || '').trim()); await open(n ? { since: n - 1 } : {}); return ''; },
    });
  }
  try { AppUI.addAction?.('Since you were away: the top changes of the rounds you missed', () => open()); } catch { /* no palette */ }

  return { build, open, card, afterUpdate, atStart, covers, showMe, fullNotes, seen, markSeen, rounds, closeCard, get cardEl() { return cardEl; }, stats };
})();
window.WhatsNew = WhatsNew;
