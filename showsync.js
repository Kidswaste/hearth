// (round 61, showsync61) This week's shows in Paris from Shotgun and DICE, in the window: venue pins with their logos on
// Sidequest Studio's Paris map (a map layer: QuestJournal.addMapLayer), a compact list behind one ✦ icon in the map's
// own icon row, a show → a quest in one click ("Go see X at Y on Friday": ticket → go → proof) saved in Codex's quest
// store, and /shows in any chat. The fetching happens in the main process (showsyncmain.js); nothing runs while idle:
// the list refreshes only when you open the map or ask (/shows), at most once a day per page. Lazy group 'showsync'
// (in the 'questjournal' lazy group, after quest-journal.js: loads with Sidequest Studio or on /shows).
const ShowSync = (() => {
  const C = ShowSyncCore, QKEY = 'quest-journal';
  let snap = null, refreshing = null, triedStale = false;
  const hub = () => window.hub?.shows;
  const QJ = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null); // a top-level const, not on window
  async function call(fn, ...a) { const h = hub(); if (!h) throw Error('Show sync needs the Hearth app (not available here).'); const r = await h[fn](...a); if (!r?.ok) throw Error(r?.error || 'Show sync could not answer.'); return r.value; }
  async function load() { snap = await call('get'); return snap; }
  // a refresh in the background when the list is a day old (only once the owner has asked for shows once)
  function refresh(force = false) {
    if (refreshing) return refreshing;
    refreshing = call('refresh', { force }).then((v) => { snap = v; redraw(); return v; }).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function ensure() { if (!snap) { await load(); redraw(); } if (snap.enabled && snap.stale && !triedStale) { triedStale = true; refresh().catch(() => {}); } return snap; }
  const shows = () => snap?.shows || [];
  const week = () => C.thisWeek(shows());
  const upcoming = () => shows().filter((s) => !s.cancelled&&(s.end||s.start+4*3600e3)>=Date.now()).sort((a, b) => a.start - b.start);
  const venueList = () => C.venues(upcoming());
  // (round 62, showprep62) extensions: another module adds to the show card, the pins, a venue, the list, /shows
  //   extend({ card(kit, show, actions, dialog), pins(pins) → pins, select(id, kit) → handled, venue(kit, venue, body),
  //            list(kit, actions), subs: ['prep', …], run(sub, arg, ctx), complete(sub, arg) })
  const ext = [];
  function extend(x) { if (x && !ext.includes(x)) ext.push(x); redraw(); }
  const each = (k, ...a) => { for (const x of ext) { try { x[k]?.(...a); } catch (err) { console.warn('[showsync extension]', k, err); } } };
  // the map redraws when its page is on screen (a layer re-added re-renders the world page)
  function redraw() { try { if (snap?.enabled && QJ()?.page === 'world') QJ().addMapLayer(layer); } catch { /* the map isn't open */ } }

  // ---------- a show → a quest in Codex's store (QuestCore validates it; the tracker sees it) ----------
  function addTo(s, c) {
    const ex = s.campaigns.find((x) => x.id === c.id);
    if (ex) { ex.paused = false; s.active = ex.id; return ex; }
    if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns. Finish or remove one first.');
    s.campaigns.push(c); s.active = c.id; return c;
  }
  async function makeQuest(show) {
    const c = C.showCampaign(show);
    let out;
    if (QJ()?.ready ? QJ().ready() : QJ()?.snapshot?.()) out = await QJ().mutate((s) => addTo(s, c), 'Show quest saved. Ticket → go → bring back one moment.');
    else {
      // the journal isn't open: the same store, the same checks as its own saves (a read that failed is never "empty")
      const r = await window.hub.kvGet(QKEY, null, { status: true });
      let s;
      if (r?.state === 'missing') s = QuestCore.initial();
      else if (r?.state === 'ok') s = QuestCore.validate(r.value);
      else throw Error('Your quest journal could not be read, so nothing was changed. Open Sidequest Studio and try again.');
      s = QuestCore.upgrade(s); out = addTo(s, c); s.updatedAt = new Date().toISOString();
      const checked = QuestCore.validate(s);
      const w = await window.hub.kvSet(QKEY, checked); if (w?.error) throw Error(w.error);
      // questhud61's contract: a save made outside the Studio is announced on document as { state, source } (the chip repaints)
      document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: QuestCore.clone(checked), source: 'showsync' } }));
    }
    return out;
  }

  // ---------- the map layer ----------
  const logoOrIcon = (url, cls = 'ss-logo') => { if (!url) return QuestAtlas.icon('music'); const img = el('img', { class: cls, attrs: { alt: '', src: url, draggable: 'false' } }); img.addEventListener('error', () => img.replaceWith(QuestAtlas.icon('music')), { once: true }); return img; };
  const when = (s) => `${C.short(s.start)}${s.soldOut ? ' · sold out' : ''}`;
  function row(kit, s, onPick) {
    const b = kit.button('', onPick, 'qj-field-list-item ss-row'); b.dataset.show = s.key; b.style.setProperty('--icon-color', '#ff6b9d');
    b.append(logoOrIcon(s.venue.logo), kit.E('strong', { text: s.title }), kit.E('span', { class: 'ss-when', text: `${when(s)} · ${s.venue.name || ''}` }));
    b.setAttribute('aria-label', `${s.title}, ${C.short(s.start)}, ${s.venue.name || ''}`); return b;
  }
  function showDetail(kit, s) {
    kit.dialog(s.title, (body, d) => {
      const head = kit.E('div', { class: 'ss-head' }, logoOrIcon(s.venue.logo, 'ss-logo ss-logo-big'), kit.E('div', {}, kit.label(`${C.dayWord(s.start).toUpperCase()} · ${C.hm(s.start)} · ${C.platformsText(s).toUpperCase()}`), kit.E('strong', { text: s.venue.name || 'Venue' }), kit.E('span', { text: s.venue.address || '' })));
      body.append(head);
      if (s.lineup.length) body.append(kit.p(`Lineup: ${s.lineup.join(', ')}`));
      if (s.price || s.soldOut) body.append(kit.p(s.soldOut ? 'Sold out on every listing.' : `From ${s.price.from} ${s.price.currency === 'EUR' ? '€' : s.price.currency}`));
      body.append(showActions(kit, s, d));
    }, 'SHOW / THIS WEEK');
  }
  // a show's buttons (its card, and the next show in a venue pin's dialog: round 64, mapfirst64)
  function showActions(kit, s, d) {
    const acts = kit.E('div', { class: 'qj-actions' });
    acts.append(kit.button('Make it a quest', async () => { const c = await makeQuest(s); d.close(); kit.questDetail?.(c.quests[0].id); }, 'qj-primary'));
    // Codex's outing desk (tools/outing-desk.js): keep this show in "my lineup" (budget, friend, .ics) — its own contract
    each('card', kit, s, acts, d); // (round 62) e.g. showprep62's "Get ready" / "How was it?"
    if (QJ()?.keepOuting) acts.append(kit.button('Keep in my lineup', async () => { d.close(); await QJ().keepOuting(outingEvent(s)); }, 'qj-quiet'));
    for (const t of s.tickets.filter((t) => t.url)) acts.append(kit.button(`Tickets on ${C.PLATFORMS[t.platform]?.name || t.platform}`, () => window.hub.openExternal(t.url), 'qj-quiet'));
    return acts;
  }
  // a show in the outing desk's normalized shape (docs/upgrades/paris-outing-desk.md › Claude integration contract)
  function outingEvent(s) {
    const lat = Number.isFinite(s.venue.lat) ? s.venue.lat : null, lon = Number.isFinite(s.venue.lon) ? s.venue.lon : null;
    return { id: `showsync-${s.key}`, title: s.title.slice(0, 180), url: s.tickets.find((t) => t.url)?.url || '', venue: s.venue.name || '', address: s.venue.address || '', kind: 'music',
      start: new Date(s.start).toISOString(), ...(s.end ? { end: new Date(s.end).toISOString() } : {}), free: false, price: s.soldOut ? 'Sold out' : s.price ? `From ${s.price.from} ${s.price.currency === 'EUR' ? '€' : s.price.currency}` : '',
      note: s.lineup.length ? `Lineup: ${s.lineup.join(', ')}`.slice(0, 600) : '', ...(lat != null ? { lat, lon } : {}), source: C.platformsText(s), updatedAt: new Date().toISOString() };
  }
  function venueDetail(kit, v) {
    kit.dialog(v.name || 'Venue', (body, d) => {
      body.append(kit.E('div', { class: 'ss-head' }, logoOrIcon(v.logo, 'ss-logo ss-logo-big'), kit.E('div', {}, kit.label(`${v.shows.length} SHOW${v.shows.length === 1 ? '' : 'S'} COMING UP`), kit.E('span', { text: v.address || '' }))));
      // (round 64, mapfirst64) the next show's own buttons right here (Make it a quest · Get ready · tickets), the rest as rows
      const [next, ...later] = v.shows;
      if (next) body.append(kit.E('div', { class: 'ss-next' }, row(kit, next, () => showDetail(kit, next)), showActions(kit, next, d)));
      for (const s of later) body.append(row(kit, s, () => showDetail(kit, s)));
      each('venue', kit, v, body);
    }, 'PARIS / VENUE');
  }
  function followDialog(kit) {
    kit.dialog('What Hearth reads', (body, d) => {
      body.append(kit.p('Paris-wide lists from Shotgun and DICE, and any venue, artist or event page you follow. Hearth reads only what those public pages publish, at most once a day, and stops when a site says no.'));
      const draw = () => {
        body.querySelector('.ss-follows')?.remove();
        const box = kit.E('div', { class: 'ss-follows' });
        for (const src of snap.sources) {
          const it = kit.E('div', { class: 'qj-field-list-item ss-src' }, QuestAtlas.icon(src.kind === 'city' ? 'compass' : 'music'), kit.E('strong', { text: src.label }), kit.E('span', { text: src.problem ? '⚠' : `${src.count}` }));
          if (src.kind !== 'city') it.append(kit.button('×', async () => { await call('unfollow', src.id); await load(); draw(); redraw(); }, 'qj-quiet ss-unfollow'));
          box.append(it);
        }
        const only = snap.from === 'followed';
        box.append(kit.button(only ? 'Add the Paris-wide lists' : 'Only what I follow', async () => { snap = await call('settings', { from: only ? 'paris' : 'followed' }); draw(); redraw(); }, 'qj-quiet'));
        body.prepend(box);
      };
      const input = kit.E('input', { type: 'url', attrs: { 'aria-label': 'A Shotgun or DICE link', placeholder: 'Paste a Shotgun or DICE venue / artist link…', maxlength: 500 } });
      body.append(kit.E('label', { class: 'qj-field' }, kit.label('Follow a page'), input), kit.button('Follow', async () => { await call('follow', input.value); input.value = ''; await load(); draw(); await refresh(true).catch(() => {}); draw(); }, 'qj-primary'));
      draw();
    }, 'SHOTGUN / DICE');
  }
  function listDialog(kit) {
    kit.dialog('Shows this week', (body,d) => {
      let error='',range=7;
      const draw = () => {
        body.querySelector('.ss-list')?.remove();
        const box = kit.E('div', { class: 'ss-list' });
        if(error)box.append(kit.p(error));
        if (!snap?.enabled) {
          box.append(kit.p('Your Paris week from Shotgun and DICE: venues on the map with their logos, a quest in one click. Hearth reads their public pages from this computer, at most once a day.'),
            kit.button('Load this week’s shows', async () => { box.append(kit.p('Reading Shotgun and DICE…')); await refresh(true); draw(); }, 'qj-primary'));
        } else {
          if (snap.status) box.append(kit.E('p', { class: 'qj-copy ss-status', text: snap.status }));
          const rangeButton=kit.button(range===7?'Next 7 days · show 21':'Next 21 days · show 7',()=>{range=range===7?21:7;draw();},'qj-quiet');box.append(rangeButton);
          const list = range===7?week():upcoming(); let day = '';
          if (!list.length) box.append(kit.p(refreshing ? 'Reading Shotgun and DICE…' : 'No shows found for the next seven days. Follow the venues you like below.'));
          for (const s of list) { const d = C.dayWord(s.start); if (d !== day) { day = d; box.append(kit.label(d.replace(/^on /, '').toUpperCase())); } box.append(row(kit, s, () => showDetail(kit, s))); }
          const acts = kit.E('div', { class: 'qj-actions' }, kit.button('What Hearth reads', () => followDialog(kit), 'qj-quiet'), kit.button(refreshing ? 'Refreshing…' : 'Refresh now', async () => { await refresh(true); draw(); }, 'qj-quiet'));
          each('list', kit, acts); box.append(acts);
        }
        const links=kit.E('div',{class:'qj-actions ss-source-links'});
        for(const platform of Object.values(C.PLATFORMS)){
          const source=snap?.sources?.filter(s=>s.platform===platform.id)||[],bad=source.find(s=>s.problem);
          const b=kit.button('Open '+platform.name,()=>window.hub.openExternal(platform.city),'qj-quiet');b.dataset.help=bad?'This source could not update. Open its public listings or follow an event link.': 'Browse the original listings, including events not in Hearth’s cache.';links.append(b);
        }box.append(links);
        body.append(box);
      };
      draw();
      ensure().then(()=>{if(d.open)draw();}).catch(e=>{error=e.message;if(d.open)draw();});
    }, 'SHOTGUN + DICE / PARIS');
  }
  const layer = {
    id: 'showsync',
    icon: (kit) => { ensure().catch(() => {}); return kit.mapIcon('spark', `Shows this week (Shotgun + DICE)${snap?.enabled ? ` · ${week().length}` : ''}`, () => listDialog(kit), '#ff6b9d', undefined, 'map-shows'); },
    pins: () => { let p = snap ? C.pins(C.venues(week())) : []; for (const x of ext) { try { if (x.pins) p = x.pins(p) || p; } catch (err) { console.warn('[showsync extension] pins', err); } } return p; },
    owns: (id) => typeof id === 'string' && id.startsWith('show-venue-'),
    select: (id, kit) => { const v = C.venues(upcoming()).find((x) => x.id === id); if (v) return venueDetail(kit, v); for (const x of ext) if (x.select?.(id, kit)) return; }
  };

  // ---------- /shows ----------
  const HELP = '/shows week · /shows venue <name> · /shows quest <show> · /shows prep <show> · /shows went <show> · /shows log · /shows follow <link> · /shows refresh — the map: Sidequest Studio › Paris after hours';
  async function run(args, ctx) {
    const [sub0, ...rest] = String(args || '').trim().split(/\s+/); const sub = (sub0 || '').toLowerCase(), arg = rest.join(' ').trim();
    await ensure();
    if (sub === 'refresh' || (!snap.enabled && ['', 'week', 'venue', 'quest', 'prep'].includes(sub))) { ctx?.say?.('Reading this week’s shows from Shotgun and DICE…'); await refresh(sub === 'refresh' || !snap.enabled); }
    else if (refreshing) await refreshing.catch(() => {});
    const status = snap.status ? `\n${snap.status}` : '';
    if (sub === '' || sub === 'refresh') {
      const list = week();
      if (!list.length) return `No shows found in Paris for the next seven days.${status}\nFollow your venues: /shows follow <Shotgun or DICE link>.`;
      const vs = new Set(list.map((s) => s.venue.key)).size;
      return `${list.length} show${list.length === 1 ? '' : 's'} this week at ${vs} venue${vs === 1 ? '' : 's'} (Shotgun + DICE):\n${list.slice(0, 6).map((s) => '• ' + C.line(s)).join('\n')}${list.length > 6 ? `\n…and ${list.length - 6} more: /shows week` : ''}${status}\n${HELP}`;
    }
    if (sub === 'week') {
      const list = week(); if (!list.length) return `Nothing this week yet.${status}`;
      let day = ''; const out = [];
      for (const s of list) { const d = C.dayWord(s.start); if (d !== day) { day = d; out.push(`${d.replace(/^on /, '')[0].toUpperCase()}${d.replace(/^on /, '').slice(1)}:`); } out.push(`  ${C.hm(s.start)} ${s.title}${s.venue.name ? ` — ${s.venue.name}` : ''}${s.lineup.length ? ` (${s.lineup.slice(0, 4).join(', ')})` : ''}`); }
      return out.join('\n') + status;
    }
    if (sub === 'venue') {
      if (!arg) return `Which venue? ${venueList().slice(0, 8).map((v) => v.name).join(', ')}`;
      const f = C.fold(arg), v = venueList().find((x) => C.fold(x.name).includes(f)) || venueList().find((x) => C.tokens(arg).some((t) => C.fold(x.name).includes(t)));
      if (!v) return `No upcoming shows found at "${arg}".${status}`;
      return `${v.name}${v.address ? ` · ${v.address}` : ''}\n${v.shows.slice(0, 10).map((s) => '• ' + C.line(s)).join('\n')}`;
    }
    if (sub === 'quest') {
      if (!arg) return 'Which show? e.g. /shows quest ' + (week()[0]?.lineup[0] || week()[0]?.title || 'arlo parks');
      const s = C.find(upcoming(), arg); if (!s) return `No upcoming show matches "${arg}". /shows week lists them.`;
      const c = await makeQuest(s);
      ctx?.note?.(`Quest saved: ${c.title}`, { id: 'showsync-quest', actions: [{ label: 'Open it', run: async () => { activate('tool:quests'); await QJ()?.flush?.(); QJ()?.questDetail?.(c.quests[0].id); } }] });
      return `Quest saved: ${c.title} — get your ticket → go → bring back one moment. It's in Sidequest Studio.`;
    }
    if (sub === 'follow') { const src = await call('follow', arg); await load(); refresh(true).catch(() => {}); return `Following ${src.label} (${C.PLATFORMS[src.platform].name}). Its shows join the list in a moment.`; }
    if (sub === 'unfollow') { const g = await call('unfollow', arg); await load(); redraw(); return `Stopped following ${g.label}.`; }
    if (sub === 'from') { if (!/^(paris|followed)$/i.test(arg)) return 'Use /shows from paris (Paris-wide lists + what you follow) or /shows from followed (only what you follow).'; snap = await call('settings', { from: arg.toLowerCase() }); redraw(); return arg.toLowerCase() === 'paris' ? 'Paris-wide lists back on, plus what you follow.' : 'Only the pages you follow from now on.'; }
    for (const x of ext) if (x.run && x.subs?.includes(sub)) return x.run(sub, arg, ctx); // (round 62) /shows prep · went · log (showprep62)
    if (sub === 'map') { activate('tool:quests'); await window.Lazy?.load?.('questjournal'); QJ()?.navigate?.('world'); return 'Opened the Paris map.'; }
    return HELP;
  }
  function complete(args) {
    const a = String(args || ''), m = /^(\w+)\s+(.*)$/.exec(a);
    if (!m) return ['week', 'venue ', 'quest ', ...ext.flatMap((x) => (x.subs || []).map((n) => (n === 'log' ? n : `${n} `))), 'refresh', 'follow ', 'unfollow ', 'from paris', 'from followed', 'map'].filter((x) => x.startsWith(a.toLowerCase())).map((x) => ({ value: x }));
    const q = C.fold(m[2]);
    for (const x of ext) if (x.complete && x.subs?.includes(m[1])) return x.complete(m[1], m[2]) || [];
    if (m[1] === 'quest') return week().filter((s) => !q || C.fold(s.title + ' ' + s.lineup.join(' ')).includes(q)).slice(0, 8).map((s) => ({ value: `quest ${s.lineup[0] || s.title}`, label: s.title, hint: `${C.short(s.start)} · ${s.venue.name}` }));
    if (m[1] === 'venue') return venueList().filter((v) => !q || C.fold(v.name).includes(q)).slice(0, 8).map((v) => ({ value: `venue ${v.name}`, hint: `${v.shows.length} upcoming` }));
    if (m[1] === 'unfollow') return (snap?.follows || []).map((f) => ({ value: `unfollow ${f.label}` }));
    return [];
  }
  if (!Commands.get('shows')) Commands.register({
    name: 'shows', area: 'Create', args: '[week | venue <name> | quest <show> | prep <show> | went <show> | log | follow <link> | refresh]',
    desc: 'This week’s shows in Paris from Shotgun and DICE: the list, a venue’s nights, a show → a quest',
    keywords: 'concerts gigs club nights events tickets shotgun dice paris venues lineup this week',
    examples: ['/shows', '/shows week', '/shows venue bataclan', '/shows quest arlo parks'],
    run, complete
  });
  try { QJ()?.addMapLayer?.(layer); } catch { /* the journal registers layers when it loads */ }
  load().then(() => { if (snap.enabled && C.pins(C.venues(week())).length) redraw(); }).catch(() => {}); // the saved list only (no network): ready before the map opens
  return { load, refresh, ensure, makeQuest, layer, run, extend, redraw, week, upcoming, showDetail, listDialog, call, // (round 64, clickfirst64) listDialog: "Shows this week…" from the ✦ tracker's More and the Studio's My week ▾
    get snap() { return snap; }, _test: { week, upcoming, venueList } };
})();
