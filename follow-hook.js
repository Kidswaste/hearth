// (round 70, follow70) ★ Follow on the show cards and in the shows panel, through showsync61's own extension hook
// (ShowSync.extend: no edit of Codex's files). Every show card (Sidequest Studio › Map › ✦ Shows this week → a show, and a
// venue pin's next show) gets "★ Follow <artist>" for each artist of its lineup and "★ Follow <venue>" (click again:
// Unfollow); the week's list gets "★ Following" (the Following dialog: follow.js) and a ★ on each show with someone you
// follow; a venue pin with such a show wears the map's ★. After each of showsync61's own loads / syncs (no new fetch,
// no timer), the shows with a followed artist / venue that weren't there before become "★ New" rows in the ✦ tracker.
// Chat (secondary): /shows following · /shows follow <name> (a link still follows a page) · /shows unfollow <name>.
// Rides in the 'questjournal' lazy group (after tickets-hook.js); the 'follow' group (FollowCore, Follow) loads first.
const FollowHook = (() => {
  const F = FollowCore;
  const fail = (err) => toast(calmError(err), { type: 'error' });
  const SC = () => ShowSyncCore;
  Follow.load().catch(() => {});

  // ---------- the card's ★ Follow buttons ----------
  const words = (kind, name) => `${Follow.isFollowing(kind, name) ? '★ Following' : '★ Follow'} ${name}`;
  function relabel(b) {
    const on = Follow.isFollowing(b.dataset.fwKind, b.dataset.fwName), t = words(b.dataset.fwKind, b.dataset.fwName), s = b.querySelector('.qj-action-text');
    if (s) { if (s.textContent !== t) s.textContent = t; } else if (b.firstChild?.nodeType === 3) { if (b.firstChild.nodeValue !== t) b.firstChild.nodeValue = t; } else b.prepend(t);
    b.setAttribute('aria-pressed', String(on)); b.classList.toggle('fw-on', on);
    b.title = on ? `You follow ${b.dataset.fwName}: click to unfollow` : `Follow ${b.dataset.fwName}: their next shows on Shotgun / DICE show up in the ✦ quest tracker`;
  }
  function starButton(kit, kind, name) {
    const b = kit.button(words(kind, name), async () => {
      const id = F.fid(kind, name);
      if (Follow.isFollowing(kind, name)) await Follow.unfollow(id); else await Follow.follow(kind, name, { from: 'card' });
    }, `qj-quiet fw-btn fw-${kind}`);
    b.dataset.fwKind = kind; b.dataset.fwName = name; relabel(b); return b;
  }
  function card(kit, show, acts) {
    const row = kit.E('div', { class: 'qj-actions fw-row', attrs: { role: 'group', 'aria-label': 'Follow the artists and the venue' } });
    const fill = () => {
      const artists = F.cardArtists(show).slice(0, 4);
      row.replaceChildren(...artists.map((a) => starButton(kit, 'artist', a)), ...(show.venue?.name ? [starButton(kit, 'venue', show.venue.name)] : []));
      if (!row.childElementCount) row.remove();
    };
    if (Follow.ready) fill(); else Follow.load().then(fill).catch(() => row.remove());
    // the card's buttons are built before they're placed (showsync.js showActions): under them once they are
    queueMicrotask(() => { if (acts.parentNode) acts.after(row); else acts.append(row); });
  }

  // ---------- the ★ badges: the list's rows, the map's venue pins ----------
  function row(kit, s, b) {
    const h = Follow.hits(s); if (!h.length) return;
    const names = [...new Set(h.map((x) => x.name))].join(', ');
    b.classList.add('fw-starred');
    b.append(kit.E('span', { class: 'fw-badge', text: '★', title: `You follow ${names}`, attrs: { 'aria-hidden': 'true' } }));
    b.setAttribute('aria-label', `${b.getAttribute('aria-label') || s.title} · you follow ${names}`);
  }
  function starredVenueIds() { return new Set(SC().venues(ShowSync.upcoming().filter((s) => Follow.hits(s).length)).map((v) => v.id)); }
  function pins(list) {
    if (!Follow.ready || !Follow.following().length) return list;
    const ids = starredVenueIds(); if (!ids.size) return list;
    // the map's own ★ on the pin (quest-atlas.js draws p.favorite), shown at every zoom like a visited venue
    return list.map((p) => (ids.has(p.id) ? (({ minZoom, ...q }) => ({ ...q, favorite: true }))(p) : p));
  }

  // ---------- the shows panel: ★ Following ----------
  function list(kit, acts) {
    const n = Follow.following().length, nw = Follow.pending().length;
    const b = kit.button(`★ Following${n ? ` · ${n}` : ''}${nw ? ` · ${nw} new` : ''}`, () => Follow.dialog(kit), 'qj-quiet fw-open');
    b.dataset.help = 'Artists and venues you follow: their new shows show up in the ✦ quest tracker. Suggestions from Shows I went to.';
    acts.append(b);
  }
  // from the ✦ tracker ("more new shows…"): the Studio's kit, then the dialog
  async function openFollowing() {
    await QuestHud.openStudio(null, 'world');
    for (let i = 0; i < 120 && !(typeof QuestJournal !== 'undefined' && QuestJournal.ready?.()); i++) await new Promise((r) => setTimeout(r, 50));
    const ui = QuestJournal.paris?.ui?.(); if (!ui) throw Error('Sidequest Studio isn’t ready yet. Try again in a moment.');
    return Follow.dialog({ ...ui, mutate: QuestJournal.mutate });
  }

  // ---------- chat (secondary): /shows following · follow <name> · unfollow <name> ----------
  async function run(sub, arg) {
    await Follow.load();
    if (sub === 'following') {
      const fs = Follow.following(), nw = Follow.pending();
      if (!fs.length) return 'You don’t follow anyone yet. Click ★ Follow on a show’s card (Sidequest Studio › Map › ✦ Shows this week → a show), or /shows follow <artist or venue>.';
      return [`★ Following ${fs.length}: ${fs.map((f) => f.name).join(', ')}`, ...nw.slice(0, 5).map((n) => `★ New: ${n.text}`), 'Unfollow from ✦ Shows this week › ★ Following.'].join('\n');
    }
    if (!arg) return sub === 'star' ? 'Who? /shows follow <artist or venue>' : 'Who? /shows unfollow <name>';
    if (sub === 'star') {
      const v = ShowSync.upcoming().some((s) => s.venue?.name && F.venueKey(s.venue.name) === F.venueKey(arg)) || /^(le|la|les|l['’])\s|\b(club|bain|cigale|bataclan|olympia|trabendo|machine|glazart|badaboum|rex|zenith|z[ée]nith|salle|th[ée]atre)\b/i.test(arg);
      const r = await Follow.follow(v ? 'venue' : 'artist', arg, { from: 'chat' });
      return r.already ? `You already follow ${r.follow.name}.` : `★ Following ${r.follow.name} (${r.follow.kind}).${r.listed.length ? ` ${r.listed.length} show${r.listed.length === 1 ? '' : 's'} already listed.` : ''} New dates show up in the ✦ quest tracker.`;
    }
    const q = F.norm(arg), f = Follow.following().find((x) => F.norm(x.name) === q) || Follow.following().find((x) => F.norm(x.name).includes(q));
    if (!f) return `You don’t follow "${arg}".`;
    await Follow.unfollow(f.id); return `Stopped following ${f.name}.`;
  }
  function complete(sub, arg) {
    const q = F.fold(arg || '');
    if (sub === 'unstar') return Follow.following().filter((f) => !q || F.fold(f.name).includes(q)).slice(0, 8).map((f) => ({ value: `unfollow ${f.name}`, hint: f.kind }));
    if (sub === 'star') { const seen = new Set(); return ShowSync.upcoming().flatMap((s) => F.cardArtists(s)).filter((a) => !seen.has(F.norm(a)) && seen.add(F.norm(a)) && (!q || F.fold(a).includes(q))).slice(0, 8).map((a) => ({ value: `follow ${a}`, hint: 'artist' })); }
    return [];
  }

  const ext = {
    card, row, pins, list, subs: ['following', 'star', 'unstar'], quiet: ['star', 'unstar'], run, complete, // star / unstar: what /shows follow · unfollow <name> hand over
    shows: () => { Follow.detect(ShowSync.upcoming()).catch(() => {}); } // after showsync61's own load / sync: nothing fetched here
  };
  document.addEventListener('hearth:follows', () => { for (const b of document.querySelectorAll('button[data-fw-kind]')) relabel(b); });
  try { ShowSync.extend(ext); if (ShowSync.snap) ext.shows(); } catch (err) { console.warn('[follow]', err); }
  return { openFollowing, card, pins };
})();
