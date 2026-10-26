// (round 67, invite67) 👋 Bring someone: the button on every upcoming show's card (Sidequest Studio › Map › ✦ Shows this
// week → a show, and a venue pin → its next show), through showsync61's own extension hook (ShowSync.extend: no edit of
// Codex's or showsync's files), plus /shows invite <show> in chat (secondary). Tiny on purpose: it rides in the
// 'questjournal' lazy group with the show cards; the card itself (invite-core.js, invite.js) loads on the first click
// (lazy group 'invite'). The weekend plan's night-out slot opens the same card (weekendplan.js).
const InviteHook = (() => {
  async function open(show, from = 'card') {
    await Lazy.load('invite');
    return Invite.open(show, { from });
  }
  const upcoming = (s) => s && !s.cancelled && (s.dateOnly || !Number.isFinite(s.start) || s.start > Date.now() - 30 * 60e3);
  const ext = {
    // the show card's buttons (showsync.js showActions): "👋 Bring someone", visible label, next to Make it a quest
    card: (kit, show, acts) => { if (upcoming(show)) acts.append(kit.button('👋 Bring someone', () => open(show, 'card').catch((err) => toast(calmError(err), { type: 'error' })), 'qj-quiet iv-bring')); },
    subs: ['invite'],
    async run(sub, arg) {
      if (!arg) return `Which show? e.g. /shows invite ${ShowSync.week()[0]?.lineup?.[0] || ShowSync.week()[0]?.title || 'arlo parks'} — or click 👋 Bring someone on a show’s card in the Paris map.`;
      const s = ShowSyncCore.find(ShowSync.upcoming(), arg);
      if (!s) return `No upcoming show matches "${arg}". /shows week lists them.`;
      await open(s, 'chat');
      return `👋 The invite card for ${s.title} is open: pick a tone and a language, then Copy or Open in WhatsApp / Messages / Instagram. Nothing is sent for you.`;
    },
    complete(sub, arg) {
      const q = ShowSyncCore.fold(arg || '');
      return ShowSync.upcoming().filter((s) => !q || ShowSyncCore.fold(`${s.title} ${s.lineup.join(' ')} ${s.venue.name}`).includes(q)).slice(0, 8)
        .map((s) => ({ value: `invite ${s.lineup[0] || s.title}`, label: s.title, hint: `${ShowSyncCore.showWhen(s)} · ${s.venue.name || ''}` }));
    }
  };
  try { ShowSync.extend(ext); } catch (err) { console.warn('[invite]', err); }
  return { open };
})();
