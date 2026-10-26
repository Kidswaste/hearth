// (round 68, tickets68) 🎟 My ticket on the show cards: "🎟 Add my ticket" (click to pick a file, or drag a PDF / image /
// screenshot / Wallet pass onto the card), then "🎟 Open my ticket" (the big bright view for the door). Through showsync61's
// own extension hook (ShowSync.extend: every show card and a venue pin's next show), Codex's quest detail hook (a show
// quest's "SHOW NIGHT" aside: QuestJournal.addDetailHook, additive) and /shows ticket <show> in chat (secondary). A file
// in Downloads named like the show is only suggested ("Is this your ticket for X? Add it"): never moved or opened.
// Tiny on purpose: it rides in the 'questjournal' lazy group with the show cards; the viewer and the adding
// (tickets.js) load on the first click (lazy group 'tickets'). One small read of the ticket list when the Studio loads;
// nothing while idle. The copies live in Hearth's data folder (data/tickets/<show>/, ticketsmain.js).
const TicketsHook = (() => {
  const map = new Map(); // show key → { phase, n, title }
  let loaded = null;
  async function op(req) { const r = await window.hub?.tickets?.op(req); if (!r?.ok) throw Error(r?.error || 'Tickets need the Hearth app (not available here).'); return r.value; }
  function take(list) {
    map.clear(); for (const t of list || []) map.set(t.key, { phase: t.phase, n: t.files.length, title: t.show.title });
    for (const b of document.querySelectorAll('button[data-ticket]')) relabel(b);
  }
  function refresh() { loaded = op({ op: 'list' }).then((v) => { take(v.list); return map; }); return loaded; }
  const has = (key) => map.get(key) || null;
  const fail = (err) => toast(calmError(err), { type: 'error' });
  const T = () => Lazy.load('tickets').then(() => Tickets);
  const open = (key, o = {}) => T().then((t) => t.view(key, o));
  const pick = (show, from = 'pick') => T().then((t) => t.pick(show, { from }));
  const addPath = (show, path, from = 'drop', o = {}) => T().then((t) => t.addPath(show, path, { from, ...o }));
  const upcoming = (s) => s && !s.cancelled && (s.dateOnly || !Number.isFinite(s.start) || s.start > Date.now() - 6 * 3600e3);
  const words = (key) => (has(key) ? '🎟 Open my ticket' : '🎟 Add my ticket');
  function relabel(b) {
    const t = words(b.dataset.ticket), s = b.querySelector('.qj-action-text');
    if (s) { if (s.textContent !== t) s.textContent = t; } else if (b.firstChild?.nodeType === 3) { if (b.firstChild.nodeValue !== t) b.firstChild.nodeValue = t; } else b.prepend(t);
    b.title = has(b.dataset.ticket) ? 'Your ticket, big and bright, ready to scan at the door' : 'Pick your ticket (PDF, image, screenshot, Wallet pass), or drag it onto this card. Hearth keeps a copy.';
  }
  function button(kit, show, cls = 'qj-quiet tk-btn') {
    const b = kit.button(words(show.key), () => (has(show.key) ? open(show.key) : pick(show)).catch(fail), cls);
    b.dataset.ticket = show.key; relabel(b); return b;
  }
  // drag a file onto the card: a copy is kept under that show (the card's next show in a venue's card)
  function dropOn(node, show) {
    if (!node || node.dataset.tkDrop) return;
    node.dataset.tkDrop = show.key;
    const files = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    node.addEventListener('dragover', (e) => { if (!files(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; node.classList.add('tk-dropping'); node.style.outline = '2px dashed var(--ui-gold, #d9b777)'; node.style.outlineOffset = '-6px'; });
    node.addEventListener('dragleave', (e) => { if (!node.contains(e.relatedTarget)) { node.classList.remove('tk-dropping'); node.style.outline = ''; } });
    node.addEventListener('drop', (e) => {
      if (!files(e)) return;
      e.preventDefault(); e.stopPropagation(); node.classList.remove('tk-dropping'); node.style.outline = '';
      const list = [...e.dataTransfer.files].slice(0, 4);
      // the path now (only valid during the drop); the bytes as a fallback for a file with no path (dragged from a browser)
      const items = list.map((f) => ({ path: window.hub.pathForFile?.(f) || '', file: f }));
      T().then((t) => t.addDropped(show, items)).catch(fail);
    });
  }
  // "Is this your ticket for X?" under the card's buttons, when a file in Downloads is named like this show
  async function suggestUnder(kit, show, acts) {
    try {
      if (has(show.key) || !upcoming(show)) return;
      const { suggest } = await op({ op: 'suggest', shows: [show] }); const s = suggest?.[0];
      if (!s || has(show.key) || !acts.isConnected) return;
      const box = kit.E('div', { class: 'qj-starting-note tk-suggest' }, kit.p(`🎟 Is this your ticket for ${show.title}? “${s.name}” in Downloads`),
        kit.E('div', { class: 'qj-actions' },
          kit.button('Add it', async () => { await addPath(show, s.path, 'downloads'); box.remove(); }, 'qj-quiet tk-add-suggested'),
          kit.button('Not this one', async () => { await op({ op: 'dismiss', sig: s.sig }); box.remove(); }, 'qj-quiet tk-dismiss')));
      box.dataset.file = s.name;
      acts.after(box);
    } catch { /* a suggestion only */ }
  }
  const ext = {
    card: (kit, show, acts, d) => {
      if (!has(show.key) && !upcoming(show)) return;
      acts.append(button(kit, show));
      dropOn(d, show); // (a show with a ticket takes another: a friend's, a second page)
      if (!has(show.key)) (loaded || refresh()).then(() => suggestUnder(kit, show, acts)).catch(() => {});
    },
    subs: ['ticket'],
    async run(sub, arg, ctx) {
      await (loaded || refresh());
      const pool = [...ShowSync.upcoming(), ...[...map.entries()].map(([key, t]) => ({ key, title: t.title, lineup: [], venue: { name: '' } }))];
      if (!arg) { const ready = [...map.entries()].filter(([, t]) => t.phase !== 'after'); return ready.length ? `Your tickets: ${ready.map(([, t]) => t.title).join(' · ')}. /shows ticket <show> opens one — or click 🎟 Open my ticket on its card.` : 'No ticket in Hearth yet. Open a show’s card (Sidequest Studio › Map › ✦ Shows this week) and click 🎟 Add my ticket, or drag the file onto the card.'; }
      const s = ShowSyncCore.find(pool, arg);
      if (!s) return `No show matches "${arg}". /shows week lists them.`;
      if (has(s.key)) { await open(s.key); return `🎟 Your ticket for ${s.title} is open. Turn your screen brightness all the way up at the door.`; }
      ctx?.note?.(`🎟 ${s.title}`, { id: 'tickets68', actions: [{ label: '🎟 Add my ticket', run: () => pick(s, 'chat') }] });
      return `No ticket for ${s.title} yet. Click 🎟 Add my ticket below (or on the show’s card) and pick the PDF, image or Wallet pass.`;
    },
    complete(sub, arg) {
      const q = ShowSyncCore.fold(arg || ''), seen = new Set();
      return [...[...map.entries()].map(([key, t]) => ({ key, title: t.title, lineup: [] })), ...ShowSync.upcoming()]
        .filter((s) => !seen.has(s.key) && seen.add(s.key) && (!q || ShowSyncCore.fold(`${s.title} ${(s.lineup || []).join(' ')}`).includes(q))).slice(0, 8)
        .map((s) => ({ value: `ticket ${s.lineup?.[0] || s.title}`, label: s.title, hint: has(s.key) ? '🎟 in Hearth' : 'no ticket yet' }));
    }
  };
  // a show quest's detail in Sidequest Studio (Codex's detail hook): the same button
  const fromCampaign = (c) => ({ key: c.show.key, title: c.show.title, start: Date.parse(c.show.start), dateOnly: !!c.show.dateOnly, venue: { name: c.show.venue || '', address: c.show.address || '' }, lineup: [] });
  function questAside({ campaign, kit }) {
    if (!campaign?.id?.startsWith('c-show-') || !campaign.show) return null;
    const show = fromCampaign(campaign);
    if (!has(show.key) && !upcoming(show)) return null;
    return kit.E('aside', { class: 'qj-starting-note tk-aside' }, kit.label('YOUR TICKET'), kit.E('div', { class: 'qj-actions' }, button(kit, show)));
  }
  // the "I went" memory (showprep62's Shows I went to): a kept ticket opens from its night
  function logButtons(kit, key) { return has(key) ? [kit.button('🎟 My ticket', () => open(key).catch(fail), 'qj-quiet tk-log')] : []; }

  document.addEventListener('hearth:tickets', (e) => { if (e.detail?.list) take(e.detail.list); });
  try { ShowSync.extend(ext); } catch (err) { console.warn('[tickets]', err); }
  try { QuestJournal.addDetailHook?.(questAside); } catch (err) { console.warn('[tickets]', err); }
  refresh().catch(() => {});
  return { refresh, has, open, pick, addPath, logButtons, button, get ready() { return loaded; } };
})();
