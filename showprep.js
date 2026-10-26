// (round 62, showprep62) Show night companion, around the shows showsync61 lists (Shotgun + DICE, Paris):
//   · Before — "Get ready" on a show card and on a show quest: add to calendar (.ics in Paris time, a Google Calendar
//     link), doors / start, the nearest Métro stations (a small bundled list) + Citymapper / RATP for live routes, the
//     lineup with one public link per artist, and a reminder on the day (off by default, per show; one timer in the
//     main process only while one is on: showprepmain.js; shown through Hearth's notifications).
//   · After — "How was it?": a rating, one moment, an optional photo → the "Shows I went to" log (count, venues visited
//     = badges on the Paris map, artists seen); the moment becomes the show quest's proof (saved on the desk, no AI);
//     "Ask Astra to check it" is the one explicit step that reviews it and finishes the quest's steps.
//   · Follow — one tap follows the artist / venue in showsync61, so their next dates come in.
//   Chat: /shows prep <show> · /shows went <show>[: 4/5 one moment] · /shows log  (through ShowSync.extend)
// Data: kv 'show-nights' { v, went: [entries], prep: { key: { show, remind, at } } } — careful reads (a log that can't be
// read is never "empty" and never saved over), every save merged with what is on disk (ShowPrepCore.merge), kv writes are
// atomic (store.js). No AI unless asked; nothing runs while idle. Lazy group 'questjournal' (after showsync.js).
const ShowPrep = (() => {
  const P = ShowPrepCore, SC = ShowSyncCore, KEY = 'show-nights', QKEY = 'quest-journal';
  const QJ = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const SS = () => (typeof ShowSync !== 'undefined' ? ShowSync : null);
  const TH = () => (typeof TicketsHook !== 'undefined' ? TicketsHook : null); // (round 68, tickets68) a kept ticket folds into the night's memory
  let store = null, canSave = false, problem = '', loading = null, saving = Promise.resolve();
  const reviews = new Map(); // show key → a running "Ask Astra to check it"

  // ---------- the log (careful read, merged atomic save) ----------
  async function read() {
    const r = await window.hub.kvGet(KEY, null, { status: true });
    if (r?.state === 'missing') return { value: P.empty(), ok: true };
    if (r?.state === 'ok') { try { return { value: P.validate(r.value), ok: true }; } catch (err) { return { value: P.empty(), ok: false, error: err.message }; } }
    return { value: P.empty(), ok: false, error: r?.error || 'unreadable' };
  }
  function load() {
    if (store) return Promise.resolve(store);
    return (loading ||= read().then((r) => { store = r.value; canSave = r.ok; problem = r.ok ? '' : r.error; return store; }).finally(() => { loading = null; }));
  }
  function save(change) {
    const task = saving.catch(() => {}).then(async () => {
      await load();
      if (!canSave) throw Error('Your show log could not be read, so nothing was changed (Hearth never saves over it). Restart Hearth, or look in 🛟 Recover.');
      const disk = await read(); if (!disk.ok) throw Error('Your show log could not be read just now, so nothing was changed. Try again in a moment.');
      const next = P.merge(disk.value, store); const out = change(next);
      const checked = P.validate(next);
      const w = await window.hub.kvSet(KEY, checked); if (w?.error) throw Error(w.error);
      store = checked; window.hub.shows?.remind?.({ op: 'arm' }).catch?.(() => {}); // the main process re-reads it: one timer, or none
      return out;
    });
    saving = task; return task;
  }

  // ---------- which shows Hearth knows (this week's list, prepared, logged, show quests) ----------
  const fromCampaign = (c) => (c?.show ? { key: c.show.key, dateOnly:!!c.show.dateOnly, title: c.show.title, start: Date.parse(c.show.start), end: null, doors: null, venue: { name: c.show.venue, address: c.show.address || '', lat: null, lon: null }, lineup: [], links: {}, tickets: c.show.url ? [{ platform: c.show.platforms?.[0] || '', url: c.show.url }] : [], platforms: c.show.platforms || [] } : null);
  async function known() {
    await load();
    const m = new Map(), add = (s) => { if (s?.key && !m.has(s.key)) m.set(s.key, s); };
    for (const s of SS()?.upcoming?.() || []) add(s);
    for (const p of Object.values(store.prep)) add(p.show);
    for (const e of store.went) add(e.show);
    try { for (const c of (await journalState())?.campaigns || []) if (c.id.startsWith('c-show-')) add(fromCampaign(c)); } catch { /* no journal: the rest still counts */ }
    return [...m.values()];
  }
  const byKey = async (key) => (await known()).find((s) => s.key === key) || null;
  async function findShow(q) { const list = await known(), k = String(q || '').trim(); return list.find((s) => s.key === k) || SC.find(list, k); }
  const wentOf = (key) => store?.went.find((e) => e.key === key && !e.removedAt) || null;

  // ---------- the quest journal: its own save when the Studio is open, the same checks otherwise ----------
  async function journalState() {
    if (QJ()?.ready?.()) return QJ().snapshot();
    if (typeof QuestCore === 'undefined') return null;
    const r = await window.hub.kvGet(QKEY, null, { status: true });
    if (r?.state === 'missing') return null;
    if (r?.state === 'ok') return QuestCore.upgrade(QuestCore.validate(r.value));
    throw Error('Your quest journal could not be read, so nothing was changed. Open Sidequest Studio and try again.');
  }
  async function journal(fn, message) {
    if (QJ()?.ready?.()) return QJ().mutate(fn, message);
    const r = await window.hub.kvGet(QKEY, null, { status: true });
    if (r?.state !== 'ok') throw Error(r?.state === 'missing' ? 'No quest journal yet.' : 'Your quest journal could not be read, so nothing was changed. Open Sidequest Studio and try again.');
    const s = QuestCore.upgrade(QuestCore.validate(r.value)), out = await fn(s); s.updatedAt = new Date().toISOString();
    const checked = QuestCore.validate(s);
    const w = await window.hub.kvSet(QKEY, checked); if (w?.error) throw Error(w.error);
    document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: QuestCore.clone(checked), source: 'showprep' } })); // questhud61's contract
    return out;
  }
  const campaignOf = (s, key) => s?.campaigns.find((c) => c.id === `c-show-${key}`) || null;
  const openSteps = (s, c) => (c ? c.quests.filter((q) => !QuestCore.done(s, q.id) && !QuestCore.skipped(s, q.id)) : []);
  // the moment on the quest's next open step (a saved submission: proof on the desk, no review, no AI)
  async function attachProof(key, proof, intent) {
    const st = await journalState().catch(() => null); if (!campaignOf(st, key)) return null;
    return journal((s) => {
      const c = campaignOf(s, key); if (!c) return null;
      c.paused = false;
      const q = QuestCore.next(s, c); if (!q) return { done: true, open: 0 };
      const have = QuestCore.submissions(s, q.id).find((x) => x.proof.fingerprint === proof.fingerprint);
      const item = have || QuestCore.submit(s, q.id, proof, intent);
      return { qid: q.id, sid: item.id, step: q.title, open: openSteps(s, c).length, reviewed: !!item.review };
    }, 'Your moment is on the show quest. Ask Astra to check it when you like.');
  }
  // asked for: Astra reviews the moment for each open step in turn; a step it confirms is completed, the first one it
  // doesn't stops the run (its words are shown). Each review is a separate lean turn (QuestReview.run).
  async function checkWithAstra(key, proof, moment, onStatus = () => {}) {
    if (reviews.has(key)) throw Error('Astra is already checking this show.');
    reviews.set(key, true);
    try {
      let finished = 0;
      for (let i = 0; i < 3; i++) {
        const step = await attachProof(key, proof, moment);
        if (!step) return { finished, text: 'This show has no quest.' };
        if (step.done) return { finished, done: true, text: finished ? `Done: the show quest is complete (${finished} step${finished === 1 ? '' : 's'} checked).` : 'The show quest is already complete.' };
        let s = await journalState(); const q = QuestCore.find(s, step.qid);
        let item = QuestCore.submissions(s, q.id).find((x) => x.id === step.sid);
        if (!item.review) {
          onStatus(`Astra is checking “${q.title}”…`);
          const job = QuestReview.run(q, item, null, onStatus), review = await job.promise;
          await journal((d) => QuestCore.saveReview(d, q.id, item.id, review), 'Astra review saved.');
          s = await journalState(); item = QuestCore.submissions(s, q.id).find((x) => x.id === step.sid);
        }
        const r = item.review;
        if (!(r?.status === 'reviewed' && r.meetsBrief)) return { finished, stopped: q.title, text: `Astra didn’t finish “${q.title}”: ${r?.better || r?.summary || 'more evidence needed'} — open the quest in Sidequest Studio to add proof.` };
        await journal((d) => QuestCore.complete(d, q.id, { note: moment, artifact: { label: proof.title, path: proof.path, kind: 'text' } }), `${q.title}: done.`);
        finished++;
      }
      return { finished, done: true, text: `Done: ${finished} step${finished === 1 ? '' : 's'} of the show quest checked and completed.` };
    } finally { reviews.delete(key); }
  }

  // ---------- after the show ----------
  const b64 = (text) => { const b = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  const sha = async (data) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data))).map((x) => x.toString(16).padStart(2, '0')).join('');
  // a photo the owner picked: a copy kept in Hearth's references + a resized JPEG for the proof (≤ 1600 px)
  async function photoFrom({ file, path }) {
    const src = path || window.hub.pathForFile?.(file);
    if (!src || !/^(?:[a-z]:[\\/]|\/)/i.test(src)) throw Error('Choose a photo saved on this computer.');
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : await window.hub.fs.read(src, { encoding: 'buffer' });
    if (!bytes?.length || bytes.length > 40 * 1024 * 1024) throw Error('Choose a photo up to 40 MB.');
    const url = URL.createObjectURL(new Blob([bytes]));
    try {
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(Error('That photo can’t be read here. Try a JPEG or PNG.')); img.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const jpg = await window.hub.saveAttachment('show-night-photo.jpg', cv.toDataURL('image/jpeg', 0.86).split(',')[1]);
      return { path: await window.hub.importRef(src), jpg, hash: await sha(bytes) };
    } finally { URL.revokeObjectURL(url); }
  }
  function noteText(show, rating, moment) {
    return [`# ${show.title}`, `${show.venue.name || 'Venue'}${show.venue.address ? ` · ${show.venue.address}` : ''}`, `${P.dateWords(show.start)} · ${P.hm(show.start)} (Paris time)`,
      ...(show.lineup.length ? [`Lineup: ${show.lineup.join(', ')}`] : []), `Rating: ${rating ? `${rating}/5` : 'not rated'}`, `One moment: ${moment}`].join('\n') + '\n';
  }
  // How was it? → the log (+ the moment on the show quest, saved as proof, no AI)
  async function went(show, { rating = null, moment = '', photo = null } = {}) {
    show = P.keep(show);
    P.entry({ show, rating, moment }); // checks the words before anything is written
    const pic = photo ? await photoFrom(photo) : null;
    const text = noteText(show, rating, String(moment).trim());
    const note = await window.hub.saveAttachment(`show-night-${show.key}.md`, b64(text));
    const proof = { type: 'file', title: `Show night: ${show.title}`.slice(0, 200), path: note, kind: 'text/markdown', bytes: new TextEncoder().encode(text).length, fingerprint: await sha(`${text}|${pic?.hash || ''}`),
      images: pic?.jpg ? [pic.jpg] : [], excerpt: text, analysis: '', coverage: `The owner’s own field note from the night (rating, one moment)${pic ? ' and one photo they took, resized to at most 1600 px' : ''}. Self-reported: going to the show was not independently verified.` };
    if (typeof QuestCore !== 'undefined') QuestCore.checkProof(proof);
    const camp = campaignOf(await journalState().catch(() => null), show.key);
    const entry = await save((s) => {
      const old = s.went.find((e) => e.key === show.key), now = new Date().toISOString();
      const e = P.entry({ show, rating, moment, photo: pic ? { path: pic.path, jpg: pic.jpg } : old?.photo || null, note, questId: camp?.id || '', at: old?.at || now, updatedAt: now });
      s.went = [e, ...s.went.filter((x) => x.key !== show.key)];
      delete s.prep[show.key]; // its reminder (if any) is done
      return e;
    });
    proofs.set(show.key, proof);
    const step = camp ? await attachProof(show.key, proof, entry.moment).catch((err) => ({ error: err.message })) : null;
    return { entry, step, stats: P.stats(store), follow: P.followable(show) };
  }
  const proofs = new Map(); // show key → the proof made this session (the stored entry keeps the note's path; see proofOf)
  async function proofOf(key) {
    if (proofs.has(key)) return proofs.get(key);
    const e = wentOf(key); if (!e?.note) return null;
    const text = noteText(e.show, e.rating, e.moment), pic = e.photo?.jpg ? e.photo : null;
    const proof = { type: 'file', title: `Show night: ${e.show.title}`.slice(0, 200), path: e.note, kind: 'text/markdown', bytes: new TextEncoder().encode(text).length, fingerprint: await sha(`${text}|${pic ? await sha(await window.hub.fs.read(pic.path, { encoding: 'buffer' })) : ''}`),
      images: pic ? [pic.jpg] : [], excerpt: text, analysis: '', coverage: `The owner’s own field note from the night (rating, one moment)${pic ? ' and one photo they took, resized to at most 1600 px' : ''}. Self-reported: going to the show was not independently verified.` };
    proofs.set(key, proof); return proof;
  }
  async function askAstra(key, onStatus) { await load(); const e = wentOf(key); if (!e) throw Error('Log the night first (How was it?).'); return checkWithAstra(key, await proofOf(key), e.moment, onStatus); }

  // ---------- follow (showsync61's followed pages) ----------
  async function follow(f) {
    const r = await window.hub.shows.follow(f.url); if (!r?.ok) throw Error(r?.error || 'Could not follow that page.');
    await SS()?.load?.(); SS()?.refresh?.(true).catch(() => {});
    return r.value;
  }

  // ---------- reminders (the main process times them; this only says which shows want one) ----------
  async function setRemind(show, on) {
    show = P.keep(show);
    await save((s) => { s.prep[show.key] = { show, remind: !!on, at: new Date().toISOString() }; });
    return on ? P.reminderAt(show) : null;
  }
  const reminding = (key) => !!store?.prep[key]?.remind;

  // ---------- the cards ----------
  const kitNow = () => { const ui = QJ()?.paris?.ui?.(); return ui ? { ...ui, mutate: QJ().mutate } : null; };
  const actions = (kit, ...kids) => kit.E('div', { class: 'qj-actions sp-row' }, ...kids.filter(Boolean));
  const timeLine = (show) => `${P.dayWord(show.start).replace(/^on /, '').toUpperCase()} · ${P.dateWords(show.start).toUpperCase()} · ${show.doors ? `DOORS ${P.hm(show.doors)} · ` : ''}STARTS ${P.hm(show.start)} · PARIS TIME`;
  async function saveIcs(show) {
    const r = await window.hub.saveFile({ defaultPath: P.fileName(show), filters: [{ name: 'Calendar', extensions: ['ics'] }], content: P.ics(show) });
    return r || null;
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  function prepDialog(kit, show) {
    if(show.dateOnly)return kit.dialog(show.title,(body)=>{body.append(kit.p(ShowSyncCore.showWhen(show)+'. Open the ticket page to confirm the schedule before planning reminders or a calendar entry.'));for(const t of show.tickets||[])if(t.url)body.append(kit.button('Check tickets',()=>window.hub.openExternal(t.url),'qj-primary'));},'PARIS / SCHEDULE');
    load().catch(() => {});
    return kit.dialog(`Get ready · ${show.title}`, (body, d) => {
      d.classList.add('sp-dialog'); d.dataset.showprep = show.key;
      const v = show.venue || {};
      body.append(kit.label(timeLine(show)), kit.E('strong', { class: 'sp-venue', text: v.name || 'Venue' }), ...(v.address ? [kit.p(v.address)] : []));
      // calendar
      body.append(kit.label('CALENDAR'), actions(kit,
        kit.button('Add to calendar (.ics)', async () => { const f = await saveIcs(show); kit.notice(f ? 'Calendar file saved. Open it to add the night to Apple Calendar / Outlook.' : 'Not saved.'); }, 'qj-primary'),
        kit.button('Google Calendar ↗', () => window.hub.openExternal(P.googleLink(show)), 'qj-quiet'),
        kit.button('Copy calendar link', async () => kit.notice((await copy(P.googleLink(show))) ? 'Google Calendar link copied.' : 'Copy failed.'), 'qj-quiet')));
      // getting there
      const st = P.nearest(v.lat, v.lon, 3), rl = P.routeLinks(v);
      body.append(kit.label('GETTING THERE'), kit.p(st.length ? `Métro: ${P.metroLine(st)} (walking minutes)` : 'No Métro hint for this address — the live routes know it.', 'sp-metro'),
        actions(kit, kit.button('Live routes · Citymapper ↗', () => window.hub.openExternal(rl.citymapper), 'qj-quiet'), kit.button('RATP ↗', () => window.hub.openExternal(rl.ratp), 'qj-quiet')));
      // lineup
      if (show.lineup?.length) {
        const list = kit.E('div', { class: 'sp-lineup' });
        for (const name of show.lineup.slice(0, 12)) { const l = P.listen(name, show.links); const b = kit.button(`${name} · ${l.kind === 'search' ? 'search' : l.label} ↗`, () => window.hub.openExternal(l.url), 'qj-quiet sp-artist'); b.dataset.kind = l.kind; list.append(b); }
        body.append(kit.label('LINEUP · ONE LISTEN EACH'), list);
      }
      // the day's reminder (off by default)
      const box = kit.E('input', { type: 'checkbox', attrs: { 'aria-label': 'Remind me on the day' } }); box.checked = reminding(show.key);
      const at = P.reminderAt(show), when = at ? P.hm(at) : '';
      const line = kit.E('label', { class: 'qj-confirm sp-remind' }, box, kit.E('span', { text: `Remind me on the day${when ? ` (around ${when})` : ''}` }));
      box.addEventListener('change', async () => { box.disabled = true; try { await setRemind(show, box.checked); kit.notice(box.checked ? `Reminder on: ${when} on the day.` : 'Reminder off.'); } catch (err) { box.checked = !box.checked; kit.notice(err.message); } finally { box.disabled = false; } });
      body.append(line, actions(kit, kit.button(wentOf(show.key) ? 'How was it? (logged)' : 'How was it?', () => { d.close(); wentDialog(kit, show); }, 'qj-quiet sp-went')));
    }, 'SHOW NIGHT / GET READY');
  }
  function wentDialog(kit, show) {
    load().catch(() => {});
    return kit.dialog(`How was it? · ${show.title}`, (body, d) => {
      d.classList.add('sp-dialog'); d.dataset.showwent = show.key;
      const old = wentOf(show.key); let rating = old?.rating || null, file = null;
      const stars = kit.E('div', { class: 'sp-stars', attrs: { role: 'group', 'aria-label': 'Rating' } });
      const paint = () => stars.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) <= (rating || 0))));
      for (let n = 1; n <= 5; n++) { const b = kit.E('button', { type: 'button', class: 'sp-star', text: '★', attrs: { 'aria-label': `${n} star${n > 1 ? 's' : ''}` } }); b.dataset.n = n; b.addEventListener('click', () => { rating = rating === n ? null : n; paint(); }); stars.append(b); }
      paint();
      const moment = kit.E('input', { type: 'text', class: 'sp-moment', attrs: { 'aria-label': 'One moment from the night', placeholder: 'One moment: a track, a detail, a feeling…', maxlength: 300 } }); moment.value = old?.moment || '';
      const pick = kit.E('input', { type: 'file', attrs: { 'aria-label': 'A photo (optional)', accept: 'image/*' } });
      pick.addEventListener('change', () => { file = pick.files?.[0] || null; });
      body.append(kit.label(`${P.dayWord(show.start).toUpperCase()} · ${show.venue?.name || ''}`.toUpperCase()), stars, kit.E('label', { class: 'qj-field' }, kit.label('ONE MOMENT'), moment), kit.E('label', { class: 'qj-field' }, kit.label('A PHOTO (OPTIONAL)'), pick));
      const result = kit.E('div', { class: 'sp-result' });
      body.append(actions(kit, kit.button('Save to my show log', async () => {
        const r = await went(show, { rating, moment: moment.value, photo: file ? { file } : null });
        result.replaceChildren(...afterView(kit, show, r, d)); body.querySelector('.sp-row')?.remove();
      }, 'qj-primary sp-save')), result);
      setTimeout(() => moment.focus(), 0);
    }, 'SHOW NIGHT / AFTER');
  }
  function afterView(kit, show, r, d) {
    const out = [kit.p(`Saved to Shows I went to (${r.stats.count}).`, 'sp-saved')];
    if (TH()?.has(show.key)) out.push(kit.p('🎟 Your ticket is kept with this night (Shows I went to). Remove it from its view when you like.', 'tk-kept'), actions(kit, ...TH().logButtons(kit, show.key))); // (round 68, tickets68)
    if (r.step?.error) out.push(kit.p(`The show quest wasn’t changed: ${r.step.error}`));
    else if (r.step?.done) out.push(kit.p('Its show quest is already complete.'));
    else if (r.step) {
      const status = kit.p(`Your moment is on the show quest as proof (next step: ${r.step.step}). Astra can check it and finish the step${r.step.open > 1 ? 's' : ''} — only when you ask.`, 'sp-quest');
      const ask = actions(kit, kit.button('Ask Astra to check it', async () => { const res = await askAstra(show.key, (t) => { status.textContent = t; }); status.textContent = res.text; if (res.done) ask.remove(); }, 'qj-quiet sp-astra'));
      out.push(status, ask);
    }
    const fol = r.follow;
    if (fol.length) out.push(kit.label('FOLLOW FOR THEIR NEXT DATES'), actions(kit, ...fol.map((f) => { const b = kit.button(`Follow ${f.name}`, async () => { await follow(f); b.textContent = `Following ${f.name} ✓`; b.disabled = true; }, 'qj-quiet sp-follow'); b.dataset.url = f.url; return b; })));
    out.push(actions(kit, kit.button('Open my show log', () => { d.close(); logDialog(kit); }, 'qj-quiet')));
    return out;
  }
  async function logDialog(kit) {
    await load();
    return kit.dialog('Shows I went to', (body, d) => {
      d.classList.add('sp-dialog'); d.dataset.showlog = '1'; const st = P.stats(store);
      body.append(kit.label(`${st.count} SHOW${st.count === 1 ? '' : 'S'} · ${st.venues.length} VENUE${st.venues.length === 1 ? '' : 'S'} · ${st.artists.length} ARTIST${st.artists.length === 1 ? '' : 'S'}${st.rating ? ` · ${st.rating}★ AVERAGE` : ''}`));
      if (!st.count) { body.append(kit.p('Nothing yet. After a show, “How was it?” on its card (or /shows went <show>) keeps the night here.')); return; }
      body.append(kit.E('div', { class: 'sp-badges' }, ...st.venues.slice(0, 16).map((v) => kit.E('span', { class: 'sp-badge', text: `✓ ${v.name}${v.n > 1 ? ` ×${v.n}` : ''}` }))));
      if (st.artists.length) body.append(kit.p(`Artists seen: ${st.artists.slice(0, 16).map((a) => `${a.name}${a.n > 1 ? ` ×${a.n}` : ''}`).join(', ')}`, 'sp-artists'));
      const list = kit.E('div', { class: 'sp-log' });
      for (const e of store.went.filter((x) => !x.removedAt).slice(0, 40)) list.append(kit.E('div', { class: 'qj-field-list-item sp-entry' }, kit.E('strong', { text: e.show.title }), kit.E('span', { text: `${P.dateWords(e.show.start)} · ${e.show.venue.name}${e.rating ? ` · ${P.stars(e.rating)}` : ''}` }), kit.E('em', { text: e.moment }), ...(TH()?.logButtons(kit, e.key) || []))); // (round 68, tickets68) 🎟 My ticket, kept with the night
      body.append(list);
    }, 'SHOW NIGHT / MY LOG');
  }

  // ---------- plugged into showsync61 (card, map, list, /shows) and the quest journal (a show quest's detail) ----------
  function visitedPins(pins) {
    if (!store) return pins;
    const st = P.stats(store), out = pins.map((p) => ({ ...p }));
    for (const v of st.venues) {
      const id = `show-venue-${SC.hash(v.key)}`, pin = out.find((p) => p.id === id), at = new Date(v.last).toISOString();
      if (pin) { pin.visitedAt = at; pin.visits = v.n; }
      else if (SC.inParis(v.lat, v.lon)) out.push({ id, name: v.name || 'Venue', lat: v.lat, lon: v.lon, kind: 'music', color: '#ff6b9d', logo: '', quest: '', visitedAt: at, show: true, count: 0, visits: v.n });
    }
    return out;
  }
  function venueLog(kit, id) {
    const v = store && P.stats(store).venues.find((x) => `show-venue-${SC.hash(x.key)}` === id); if (!v) return false;
    kit.dialog(v.name || 'Venue', (body) => { body.append(kit.label(`✓ YOU WENT ${v.n}× · LAST ${P.dateWords(v.last).toUpperCase()}`)); for (const e of store.went.filter((x) => !x.removedAt && (x.show.venue.key || P.fold(x.show.venue.name)) === v.key)) body.append(kit.p(`${P.dateWords(e.show.start)} · ${e.show.title}${e.rating ? ` · ${P.stars(e.rating)}` : ''} — ${e.moment}`)); }, 'PARIS / A VENUE YOU KNOW');
    return true;
  }
  const extension = {
    subs: ['prep', 'went', 'log'],
    // the card: "Get ready" (How was it? lives inside it; on the card too once the show has started)
    card: (kit, show, acts, d) => { acts.prepend(kit.button('Get ready', () => { d.close(); prepDialog(kit, show); }, 'qj-quiet sp-ready'), show.start <= Date.now() ? kit.button('How was it?', () => { d.close(); wentDialog(kit, show); }, 'qj-quiet sp-went') : ''); },
    pins: (pins) => visitedPins(pins),
    select: (id, kit) => venueLog(kit, id),
    venue: (kit, v, body) => {
      const x = store && P.stats(store).venues.find((y) => y.key === v.key); if (!x) return;
      const last = store.went.find((e) => !e.removedAt && (e.show.venue.key || P.fold(e.show.venue.name)) === x.key);
      body.prepend(kit.label(`✓ YOU WENT ${x.n}×`), ...(last ? [kit.p(`Last time: ${P.dateWords(last.show.start)} · ${last.show.title}${last.rating ? ` · ${P.stars(last.rating)}` : ''} — ${last.moment}`, 'sp-lasttime')] : []));
    },
    list: (kit, acts) => { const n = store ? P.stats(store).count : 0; acts.append(kit.button(`Shows I went to${n ? ` · ${n}` : ''}`, () => logDialog(kit), 'qj-quiet sp-logbtn')); },
    run: (sub, arg, ctx) => run(sub, arg, ctx),
    complete: (sub, arg) => complete(sub, arg)
  };
  function questAside({ campaign, close, kit }) {
    if (!campaign?.id?.startsWith('c-show-')) return null;
    const key = campaign.id.slice(7), e = wentOf(key);
    const open = async (fn) => { const show = await byKey(key); if (!show) throw Error('This show is no longer listed.'); close(); fn(kit, show); };
    return kit.E('aside', { class: 'qj-starting-note sp-aside' }, kit.label(e ? `SHOW NIGHT · LOGGED ${P.stars(e.rating)}` : 'SHOW NIGHT'),
      actions(kit, kit.button('Get ready', () => open(prepDialog), 'qj-quiet sp-ready'), kit.button(e ? 'How was it? (logged)' : 'How was it?', () => open(wentDialog), 'qj-quiet sp-went')));
  }

  // ---------- chat: /shows prep · went · log ----------
  function prepText(show) {
    if(show.dateOnly)return `${show.title} · ${ShowSyncCore.showWhen(show)}. Confirm the schedule on your ticket before adding reminders or calendar entries. ${show.tickets?.[0]?.url||''}`;
    const v = show.venue || {}, st = P.nearest(v.lat, v.lon, 3), rl = P.routeLinks(v);
    return [`${show.title}`, `${P.dayWord(show.start)[0].toUpperCase()}${P.dayWord(show.start).slice(1)} (${P.dateWords(show.start)}) · ${show.doors ? `doors ${P.hm(show.doors)}, ` : ''}starts ${P.hm(show.start)} Paris time`,
      `${v.name || 'Venue'}${v.address ? ` · ${v.address}` : ''}`, st.length ? `Métro: ${P.metroLine(st)} (walking minutes)` : 'Métro: no hint for this address.',
      `Live routes: Citymapper ${rl.citymapper} · RATP ${rl.ratp}`,
      ...(show.lineup?.length ? [`Listen: ${show.lineup.slice(0, 8).map((n) => `${n} ${P.listen(n, show.links).url}`).join(' · ')}`] : []),
      `Google Calendar: ${P.googleLink(show)}`,
      reminding(show.key) ? `Reminder on: around ${P.hm(P.reminderAt(show))} on the day.` : 'Reminder: off (turn it on from the note below or the card).'].join('\n');
  }
  async function openInStudio(fn, show) {
    activate('tool:quests'); await window.Lazy?.load?.('questjournal');
    for (let i = 0; i < 80 && !QJ()?.ready?.(); i++) await new Promise((r) => setTimeout(r, 50));
    const kit = kitNow(); if (!kit) throw Error('Sidequest Studio isn’t ready yet. Try again in a moment.');
    return fn(kit, show);
  }
  function parseWent(arg) { // "<show>: 4/5 one moment"  ·  "<show>" alone opens the card
    const i = arg.indexOf(':'); if (i < 0) return { q: arg.trim(), rest: '' };
    const q = arg.slice(0, i).trim(); let rest = arg.slice(i + 1).trim(), rating = null;
    const m = /^(?:([1-5])\s*(?:\/\s*5|★|stars?)|(★{1,5}))\s*[-–—,.:]?\s*/i.exec(rest); if (m) { rating = m[1] ? Number(m[1]) : m[2].length; rest = rest.slice(m[0].length); }
    return { q, rest, rating };
  }
  async function run(sub, arg, ctx) {
    await load();
    if (sub === 'log') {
      const st = P.stats(store); if (!st.count) return 'No shows logged yet. After a night out: /shows went <show>: 4/5 one moment.';
      return [`Shows I went to: ${st.count} · ${st.venues.length} venue${st.venues.length === 1 ? '' : 's'} · ${st.artists.length} artist${st.artists.length === 1 ? '' : 's'}${st.rating ? ` · ${st.rating}★ average` : ''}`,
        `Venues: ${st.venues.slice(0, 8).map((v) => `${v.name}${v.n > 1 ? ` ×${v.n}` : ''}`).join(', ')}`,
        ...(st.artists.length ? [`Artists: ${st.artists.slice(0, 10).map((a) => `${a.name}${a.n > 1 ? ` ×${a.n}` : ''}`).join(', ')}`] : []),
        ...store.went.filter((e) => !e.removedAt).slice(0, 5).map((e) => `• ${P.dateWords(e.show.start)} · ${e.show.title} — ${e.show.venue.name}${e.rating ? ` ${P.stars(e.rating)}` : ''}: ${e.moment}`)].join('\n');
    }
    if (sub === 'prep') {
      if (!arg) return `Which show? ${(SS()?.week?.() || []).slice(0, 5).map((s) => s.lineup[0] || s.title).join(', ') || 'none this week'} — /shows prep <show>`;
      const show = await findShow(arg); if (!show) return `No show matches “${arg}”. /shows week lists them.`;
      ctx?.note?.(`Get ready: ${show.title}`, { id: 'showprep-prep', actions: [
        { label: 'Add to calendar (.ics)', run: async () => { const f = await saveIcs(show); ctx?.say?.(f ? `Calendar file saved: ${f}` : 'Not saved.'); } },
        { label: reminding(show.key) ? 'Reminder off' : 'Remind me on the day', run: async () => { const on = !reminding(show.key); await setRemind(show, on); ctx?.say?.(on ? `Reminder on: around ${P.hm(P.reminderAt(show))} on the day.` : 'Reminder off.'); } },
        { label: 'Open the card', run: () => openInStudio(prepDialog, show) }] });
      return prepText(show);
    }
    if (sub === 'went') {
      const { q, rest, rating } = parseWent(arg || '');
      if (!q) return 'Which show? /shows went <show> (opens “How was it?”), or /shows went <show>: 4/5 one moment';
      const show = await findShow(q); if (!show) return `No show matches “${q}”. /shows log lists the nights you kept.`;
      if (!rest) { await openInStudio(wentDialog, show); return `Opened “How was it?” for ${show.title}.`; }
      const r = await went(show, { rating, moment: rest });
      const lines = [`Logged: ${show.title}${rating ? ` ${P.stars(rating)}` : ''} — “${r.entry.moment}”. Shows I went to: ${r.stats.count}.`];
      if (r.step?.error) lines.push(`The show quest wasn’t changed: ${r.step.error}`);
      else if (r.step && !r.step.done) lines.push(`The moment is on its show quest as proof (next step: ${r.step.step}); Astra checks it only when you ask.`);
      const acts = [...r.follow.map((f) => ({ label: `Follow ${f.name}`, run: async () => { await follow(f); ctx?.say?.(`Following ${f.name}: their next dates join /shows.`); } }))];
      if (r.step && !r.step.done && !r.step.error) acts.push({ label: 'Ask Astra to check it', run: async () => ctx?.say?.((await askAstra(show.key)).text) });
      if (acts.length) ctx?.note?.(`After ${show.title}`, { id: 'showprep-went', actions: acts });
      if (r.follow.length) lines.push(`Follow for their next dates: ${r.follow.map((f) => f.name).join(', ')} (buttons below, or /shows follow <link>).`);
      return lines.join('\n');
    }
    return null;
  }
  function complete(sub, arg) {
    const q = P.fold(arg || ''), list = sub === 'went' ? [...(store?.went.map((e) => e.show) || []), ...(SS()?.upcoming?.() || [])] : SS()?.week?.() || [];
    const seen = new Set();
    return list.filter((s) => !seen.has(s.key) && seen.add(s.key) && (!q || P.fold(`${s.title} ${s.lineup.join(' ')} ${s.venue.name}`).includes(q))).slice(0, 8).map((s) => ({ value: `${sub} ${s.lineup[0] || s.title}`, label: s.title, hint: `${P.dateWords(s.start)} · ${s.venue.name}` }));
  }

  try { SS()?.extend?.(extension); } catch (err) { console.warn('[showprep]', err); }
  try { QJ()?.addDetailHook?.(questAside); } catch (err) { console.warn('[showprep]', err); }
  load().then(() => SS()?.redraw?.()).catch(() => {}); // the log's badges on the map (one small read, when the Studio loads)
  // (round 64, clickfirst64) one click from the ✦ tracker's show quest card / More menu: Get ready, How was it?, Shows I went to
  async function openCard(which, key) {
    if (which === 'log') return openInStudio((kit) => logDialog(kit));
    const show = await byKey(key); if (!show) throw Error('This show is no longer listed.');
    return openInStudio(which === 'went' ? wentDialog : prepDialog, show);
  }
  return { load, went, setRemind, prepDialog, wentDialog, logDialog, openCard, askAstra, follow, run, findShow, known, prepText, get store() { return store; }, get problem() { return problem; }, _test: { visitedPins, parseWent, attachProof, journalState } };
})();
