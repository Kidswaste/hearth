// (round 70, follow70) ★ Follow artists and venues, the window side: the store (kv 'show-follows'), what a sync brought in
// ("★ New: Floating Points at Petit Bain, Sat 14 Nov"), the ★ New row's buttons (Make it a quest · Bring someone ·
// Dismiss) and the Following dialog (Sidequest Studio › Map › ✦ Shows this week › ★ Following): who you follow, Unfollow,
// suggestions from "Shows I went to" (two nights or more) with one-click ★ Follow, and a name box for anyone else.
// Nothing is fetched for this: the news come from the shows showsync61 already reads, at its own pace (once a day, when
// you look). Careful reads (a store that can't be read is never "empty" and never saved over), every save merged with
// what is on disk (FollowCore.merge), kv writes are atomic (store.js). Lazy group 'follow' (tier use): loaded with the
// Studio's show code (the 'questjournal' group needs it) or on the first click of a ★ New row in the ✦ tracker.
const Follow = (() => {
  const F = FollowCore, KEY = 'show-follows', WENT = 'show-nights';
  let store = null, canSave = false, problem = '', loading = null, saving = Promise.resolve();

  // ---------- the store ----------
  async function read() {
    const r = await window.hub.kvGet(KEY, null, { status: true });
    if (r?.state === 'missing') return { value: F.empty(), ok: true };
    if (r?.state === 'ok') { try { return { value: F.validate(r.value), ok: true }; } catch (err) { return { value: F.empty(), ok: false, error: err.message }; } }
    return { value: F.empty(), ok: false, error: r?.error || 'unreadable' };
  }
  function load() {
    if (store) return Promise.resolve(store);
    return (loading ||= read().then((r) => { store = r.value; canSave = r.ok; problem = r.ok ? '' : r.error; return store; }).finally(() => { loading = null; }));
  }
  function save(change) {
    const task = saving.catch(() => {}).then(async () => {
      await load();
      if (!canSave) throw Error('Your followed artists and venues could not be read, so nothing was changed (Hearth never saves over them). Restart Hearth, or look in 🛟 Recover.');
      const disk = await read(); if (!disk.ok) throw Error('Your followed artists and venues could not be read just now, so nothing was changed. Try again in a moment.');
      const next = F.merge(disk.value, store); const out = change(next);
      const checked = F.validate(next);
      const w = await window.hub.kvSet(KEY, checked); if (w?.error) throw Error(w.error);
      store = checked; announce();
      return out;
    });
    saving = task; return task;
  }
  // the ✦ tracker, the card buttons, the ★ badges and the map pins follow this
  const announce = () => document.dispatchEvent(new CustomEvent('hearth:follows', { detail: { pending: F.pending(store || F.empty()).length, follows: F.active(store || F.empty()).length } }));
  const S = () => store || F.empty();
  const SS = () => (typeof ShowSync !== 'undefined' ? ShowSync : null);
  const shows = () => SS()?.upcoming?.() || [];

  // ---------- reading ----------
  const following = () => F.active(S());
  const hits = (show) => (store ? F.hits(store, show) : []);
  const isFollowing = (kind, name) => F.isFollowing(S(), kind, name);
  const pending = () => F.pending(S());
  const news = (key) => S().news.find((n) => n.key === key) || null;
  const comingUp = (f) => shows().filter((s) => F.hits({ follows: [f] }, s).length);

  // ---------- changes (each one click) ----------
  // a typed name takes the listing's own spelling when a listed artist / venue is the same ("cigale" → "La Cigale")
  function canonical(kind, name) {
    const k = kind === 'venue' ? F.venueKey(name) : F.norm(name);
    for (const s of shows()) {
      if (kind === 'venue') { if (s.venue?.name && F.venueKey(s.venue.name) === k) return s.venue.name; }
      else { const a = F.cardArtists(s).find((x) => F.norm(x) === k); if (a) return a; }
    }
    return String(name).trim();
  }
  async function follow(kind, name, { from = 'card' } = {}) {
    if (from === 'name' || from === 'chat') name = canonical(kind, name);
    const r = await save((st) => F.follow(st, kind, name, shows()));
    const n = r.listed.length;
    if (!r.already) toast(`★ Following ${r.follow.name}${n ? ` · ${n} show${n === 1 ? '' : 's'} already listed (★ on the map and in the list)` : ''}. New dates show up in the ✦ quest tracker.`, { timeout: 4500 });
    SS()?.redraw?.(); // the ★ on the map pins
    return { ...r, from };
  }
  async function unfollow(id) {
    const f = await save((st) => F.unfollow(st, id));
    if (f) toast(`Stopped following ${f.name}.`, { timeout: 2500 });
    SS()?.redraw?.();
    return f;
  }
  const dismiss = (key) => save((st) => F.mark(st, key, 'dismiss'));
  // what a sync brought in (showsync61's own load / refresh: no fetch here). Saves only when something is new.
  let detecting = Promise.resolve([]);
  function detect(list = shows()) {
    detecting = detecting.catch(() => []).then(async () => {
      await load();
      if (!canSave || !F.active(store).length) return [];
      if (!F.detect(F.validate(store), list).length) return []; // a dry run on a copy first: nothing new → no write at all
      return save((st) => F.detect(st, list));
    });
    return detecting;
  }
  // the "I went" history (showprep62's log), read only: artists / venues of two nights or more
  async function suggestions() {
    await load();
    let r; try { r = await window.hub.kvGet(WENT, null, { status: true }); } catch { return []; }
    if (r?.state !== 'ok') return [];
    try { return F.suggest(r.value, store); } catch { return []; }
  }

  // ---------- the ★ New row's buttons (the ✦ tracker and the Following dialog) ----------
  async function makeQuest(key) {
    const n = news(key) || (await load(), news(key)); if (!n) throw Error('That show is no longer in the list.');
    await Lazy.load('questjournal'); // ShowSyncCore's show quest (the Studio isn't opened)
    const c = await ShowSync.makeQuest(n.show);
    await save((st) => F.mark(st, key, 'quest'));
    toast(`Quest saved: ${c.title}. Get your ticket → go → bring back one moment.`, { timeout: 4000 });
    return c;
  }
  async function bring(key) {
    const n = news(key) || (await load(), news(key)); if (!n) throw Error('That show is no longer in the list.');
    await Lazy.load('invite');
    return Invite.open(n.show, { from: 'follow' });
  }

  // ---------- the Following dialog (in the shows panel) ----------
  function dialog(kit) {
    return kit.dialog('Following', (body, d) => {
      d.classList.add('fw-dialog'); d.dataset.following = '1';
      body.append(kit.p('★ Follow an artist or a venue. When Shotgun or DICE lists a new show with them, the ✦ quest tracker says so, and the show gets a ★ on the map and in the list. Hearth only looks at the shows it already reads: nothing extra is fetched.'));
      const box = kit.E('div', { class: 'fw-box' }); body.append(box);
      const sugBox = kit.E('div', { class: 'fw-box fw-suggest' });
      const draw = async () => {
        await load();
        const parts = [];
        if (problem) parts.push(kit.p('Your followed artists and venues could not be read just now, so nothing can be changed. Restart Hearth, or look in 🛟 Recover.'));
        const nw = pending();
        if (nw.length) {
          parts.push(kit.label(`NEW · ${nw.length}`));
          for (const n of nw.slice(0, 8)) parts.push(kit.E('div', { class: 'qj-field-list-item fw-news', dataset: { show: n.key } }, kit.E('strong', { text: `★ New: ${n.text}` }),
            kit.E('div', { class: 'qj-actions' }, kit.button('Make it a quest', async () => { d.close(); await makeQuest(n.key); }, 'qj-primary fw-quest'), kit.button('👋 Bring someone', () => bring(n.key), 'qj-quiet fw-bring'), kit.button('Dismiss', async () => { await dismiss(n.key); draw(); }, 'qj-quiet fw-dismiss'))));
        }
        const fs = following();
        parts.push(kit.label(fs.length ? `FOLLOWING · ${fs.length}` : 'FOLLOWING'));
        if (!fs.length) parts.push(kit.p('Nobody yet. Click ★ Follow on a show’s card (each artist and the venue have one), pick from your nights below, or type a name.'));
        for (const f of fs.slice().sort((a, b) => a.name.localeCompare(b.name))) {
          const next = comingUp(f);
          const item = kit.E('div', { class: 'qj-field-list-item fw-item', dataset: { follow: f.id } }, kit.E('span', { class: 'fw-star', text: '★', attrs: { 'aria-hidden': 'true' } }),
            kit.E('strong', { text: f.name }), kit.E('span', { class: 'fw-kind', text: `${f.kind}${next.length ? ` · ${next.length} coming up` : ''}` }));
          item.append(kit.button('Unfollow', async () => { await unfollow(f.id); draw(); }, 'qj-quiet fw-unfollow'));
          if (next.length && SS()) { const s = next[0]; const b = kit.button(`${F.dateWords(s.start)} · ${s.title}`, () => SS().showDetail(kit, s), 'qj-quiet fw-next'); item.append(b); }
          parts.push(item);
        }
        box.replaceChildren(...parts);
        const sug = await suggestions();
        sugBox.replaceChildren(...(sug.length ? [kit.label('FROM SHOWS I WENT TO'), ...sug.map((x) => kit.E('div', { class: 'qj-field-list-item fw-sug', dataset: { name: x.name } }, kit.E('strong', { text: x.name }), kit.E('span', { class: 'fw-kind', text: `${x.kind} · you went ${x.n}×` }),
          kit.button(`★ Follow ${x.name}`, async () => { await follow(x.kind, x.name, { from: 'went' }); draw(); }, 'qj-quiet fw-sug-follow')))] : []));
      };
      // anyone else, by name (an artist or a venue)
      const input = kit.E('input', { type: 'text', attrs: { 'aria-label': 'An artist or a venue to follow', placeholder: 'An artist or a venue…', maxlength: 120 } });
      const kind = kit.E('select', { attrs: { 'aria-label': 'Artist or venue' } }); for (const [v, t] of [['artist', 'Artist'], ['venue', 'Venue']]) { const o = kit.E('option', { text: t }); o.value = v; kind.append(o); }
      const add = kit.button('★ Follow', async () => { const name = input.value.trim(); if (!name) throw Error('Type the artist’s or the venue’s name.'); await follow(kind.value, name, { from: 'name' }); input.value = ''; draw(); }, 'qj-primary fw-add');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
      body.append(sugBox, kit.E('div', { class: 'qj-field fw-name' }, kit.label('Follow by name'), kit.E('div', { class: 'fw-name-row' }, input, kind, add)));
      draw().catch((err) => box.replaceChildren(kit.p(calmError(err))));
    }, 'SHOWS / ★ FOLLOW');
  }

  return { load, follow, unfollow, dismiss, detect, suggestions, makeQuest, bring, dialog, following, hits, isFollowing, pending, news, comingUp, get ready() { return !!store; }, get problem() { return problem; } };
})();
