// (round 64, parisjournal64) My Paris: a personal map journal of what you actually did, as a layer on Codex's Paris map
// in Sidequest Studio (QuestJournal.addMapLayer). Every finished place quest, show you went to (showprep62's log), walk
// you walked (questwalk63) and park session (parkjam62's takes) is a small ✓ / photo pin where it happened; a timeline
// strip under the map picks a month; a pin or a dot opens the moment (photo, note, rating, the loop to play).
// The monthly recap (/paris month [name], or Recap… in the strip): places / shows / walks / park sessions, the 20
// arrondissements lighting up, what's new, "Paris explored" (% of the guide's places) and an image card drawn here, in
// the window, saved as a PNG in your Pictures › Hearth › My Paris folder. Nothing is uploaded, nothing is fetched.
// Reads only what exists (the journal, the show log, the park folders); the one thing kept is a tiny per-computer
// preference (layer on / month, localStorage). Zero idle cost: no timers; work happens when the map draws or you ask.
// The thinking is in tools/parisjournal-core.js.
const ParisJournal = window.ParisJournal = (() => {
  const K = ParisJournalCore;
  const J = () => (typeof QuestJournal !== 'undefined' ? QuestJournal : null);
  const ui = () => J().paris.ui();
  const PREF = 'parisjournal64';
  let prefs = { on: true, month: '', ...(store.get(PREF, {}) || {}) };
  let takes = null, takesLoading = null; // parkjam62's takes, read once (and again after a new take)
  let memo = { s: null, shows: null, takes: null, list: [] };
  let lastCard = null;
  const _test = { saved: [] };
  const savePrefs = () => store.set(PREF, { on: prefs.on, month: prefs.month });
  const fmtDay = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------- what exists ----------
  const studioState = () => { try { return J()?.ready?.() ? ui().state() : null; } catch { return null; } };
  const showStore = () => (typeof ShowPrep !== 'undefined' ? ShowPrep.store : null);
  function loadTakes(force = false) {
    if (takes && !force) return Promise.resolve(takes);
    return (takesLoading ||= (async () => {
      try { const r = await window.hub.parkSong?.list?.(); takes = Array.isArray(r?.takes) ? r.takes : []; } catch { takes = []; }
      memo.s = null; return takes;
    })().finally(() => { takesLoading = null; }));
  }
  function moments(s) {
    if (!s) return [];
    const shows = showStore();
    if (memo.s === s && memo.shows === shows && memo.takes === takes) return memo.list;
    let list = [];
    try { list = K.collect({ C: QuestCore, s, P: typeof QuestParis !== 'undefined' ? QuestParis : null, shows, takes: takes || [] }); } catch (err) { console.warn('[parisjournal]', err); }
    memo = { s, shows, takes, list };
    return list;
  }
  // the journal for a recap from chat without opening the Studio: the open Studio's, else the tracker's, else one careful
  // read (a read that fails is reported, never treated as empty; nothing is ever written back)
  async function journalState() {
    const open = studioState(); if (open) return open;
    try { const S = typeof QuestHud !== 'undefined' ? QuestHud.journal?.().S : null; if (S) return S; } catch { /* the tracker isn't in */ }
    const r = await window.hub.kvGet('quest-journal', null, { status: true });
    if (r?.state === 'missing') return QuestCore.upgrade(QuestCore.initial());
    if (r?.state !== 'ok') throw Error('Your quest journal could not be read just now, so there is no recap yet. Open Sidequest Studio (/quests) and try again.');
    return QuestCore.validate(QuestCore.upgrade(r.value));
  }
  async function everything() {
    const [s] = await Promise.all([journalState(), loadTakes(), typeof ShowPrep !== 'undefined' ? ShowPrep.load().catch(() => null) : null]);
    return { s, list: moments(s) };
  }
  const guide = () => (typeof QuestParis !== 'undefined' ? QuestParis.guide : []);
  const recapOf = (s, list, month) => K.recap(list, month, { guide: guide(), stamps: K.stamps(s) });

  // ---------- the map layer ----------
  function shownPins() {
    const s = studioState(); if (!s || !prefs.on) return [];
    if (!takes && !takesLoading) loadTakes().then(redraw);
    return K.pins(moments(s), prefs.month).map((p) => ({ ...p, logo: p.photo ? WinMac.fileUrl(p.photo) : '' }));
  }
  const layer = {
    id: 'parisjournal',
    icon: (kit) => { const n = moments(studioState()).length; return kit.mapIcon('notebook', prefs.on ? `My Paris · ${n} moment${n === 1 ? '' : 's'} (hide)` : `My Paris · show what you did (${n})`, () => toggle(), K.KINDS.place.color, prefs.on, 'map-my-paris'); },
    pins: () => shownPins(),
    owns: (id) => String(id).startsWith('mp-'),
    select: (id, kit) => { const pin = shownPins().find((p) => p.id === id); if (pin) openMoments(pin.moments, kit); },
    below: (kit) => (prefs.on ? strip(kit) : null),
  };
  function redraw() { try { J()?.addMapLayer?.(layer); } catch { /* the map isn't open */ } }
  function toggle(on = !prefs.on) { prefs.on = on; savePrefs(); redraw(); }
  function setMonth(month) { prefs.month = month || ''; savePrefs(); redraw(); }

  // ---------- the timeline strip under the map: months, then this month's moments as dots ----------
  function strip(kit) {
    const s = studioState(), list = moments(s), ms = K.months(list), { E } = kit;
    if (prefs.month && !ms.some((m) => m.key === prefs.month)) prefs.month = '';
    const box = E('section', { class: 'pj-strip', attrs: { 'aria-label': 'My Paris timeline' } });
    const chips = E('div', { class: 'pj-months', attrs: { role: 'group', 'aria-label': 'Show one month' } });
    const chip = (key, text) => { const b = E('button', { type: 'button', class: `pj-month${prefs.month === key ? ' on' : ''}`, text, attrs: { 'aria-pressed': String(prefs.month === key) }, on: { click: () => setMonth(key) } }); b.dataset.month = key || 'all'; return b; };
    chips.append(chip('', `All · ${list.length}`), ...ms.map((m) => chip(m.key, `${m.short} · ${m.n}`)));
    const shown = list.filter((m) => !prefs.month || m.month === prefs.month);
    const track = E('div', { class: 'pj-track', attrs: { role: 'list', 'aria-label': prefs.month ? K.monthName(prefs.month) : 'All time' } });
    if (shown.length) {
      let lo, hi;
      if (prefs.month) { const [y, mo] = prefs.month.split('-').map(Number); lo = new Date(y, mo - 1, 1).getTime(); hi = new Date(y, mo, 1).getTime(); }
      else { const t = shown.map((m) => Date.parse(m.at)); lo = Math.min(...t); hi = Math.max(...t); if (hi - lo < 864e5) { lo -= 432e5; hi += 432e5; } }
      for (const m of [...shown].reverse()) {
        const x = Math.max(0, Math.min(1, (Date.parse(m.at) - lo) / (hi - lo))), k = K.KINDS[m.kind];
        const dot = E('button', { type: 'button', class: `pj-dot pj-${m.kind}${m.photo ? ' has-photo' : ''}`, attrs: { role: 'listitem', 'aria-label': `${fmtDay(m.at)} · ${k.name} · ${m.title}`, title: `${fmtDay(m.at)} · ${m.title}` }, on: { click: () => openMoments([m.id], kit) } });
        dot.style.setProperty('--x', `${(x * 100).toFixed(2)}%`); dot.style.setProperty('--c', k.color); dot.dataset.moment = m.id;
        track.append(dot);
      }
    } else track.append(E('span', { class: 'pj-empty', text: 'Nothing yet: finish a place quest, keep a show night, walk a walk or record a park loop.' }));
    const month = prefs.month || ms[0]?.key || K.monthOf(Date.now());
    box.append(kit.label('MY PARIS'), chips, track, kit.button('Recap…', () => recapDialog(month, kit), 'qj-quiet pj-recap-btn'));
    return box;
  }

  // ---------- a moment (from a pin or a dot) ----------
  function openMoments(ids, kit = ui()) {
    const list = moments(studioState()).filter((m) => ids.includes(m.id)); if (!list.length) return;
    const { E, p, label, button } = kit, first = list[0];
    return kit.dialog(list.length > 1 ? first.place?.name || first.title : first.title, (body, d) => {
      d.classList.add('pj-dialog');
      for (const m of list) body.append(momentCard(m, { E, p, label, button, close: () => d.close(), kit }));
    }, 'MY PARIS / A MOMENT');
  }
  function momentCard(m, { E, p, label, button, close, kit }) {
    const k = K.KINDS[m.kind], arr = m.arrs.length ? ` · ${m.arrs.map(K.arrLabel).join(', ')}` : '';
    const card = E('article', { class: `pj-moment pj-${m.kind}` }); card.dataset.moment = m.id; card.style.setProperty('--c', k.color);
    card.append(label(`${k.name.toUpperCase()} · ${fmtDay(m.at).toUpperCase()}${arr.toUpperCase()}`));
    if (secondLine(m)) card.append(E('strong', { text: m.title }));
    if (m.photo) { const img = E('img', { class: 'pj-photo', attrs: { src: WinMac.fileUrl(m.photo), alt: `Your photo: ${m.title}`, loading: 'lazy', draggable: 'false' } }); img.addEventListener('error', () => img.remove(), { once: true }); card.append(img); }
    if (m.rating) card.append(E('span', { class: 'pj-stars', text: '★'.repeat(m.rating) + '☆'.repeat(5 - m.rating), attrs: { 'aria-label': `${m.rating} of 5 stars` } }));
    if (m.note) card.append(p(m.note));
    if (m.kind === 'walk' && m.spots?.length) card.append(p(`${m.spots.map((x) => x.name).join(' → ')}${m.km ? ` · ${m.km} km` : ''}`, 'qj-paris-best'));
    if (m.via) card.append(p(`A stop on “${m.via}”`, 'qj-paris-best'));
    if (m.lineup?.length) card.append(p(m.lineup.slice(0, 4).join(' · '), 'qj-paris-best'));
    const acts = E('div', { class: 'qj-actions' });
    if (m.loop) { const au = E('audio', { class: 'pj-loop', attrs: { controls: '', preload: 'none', src: WinMac.fileUrl(m.loop), 'aria-label': `Play the loop: ${m.title}` } }); au.loop = true; card.append(au); acts.append(button('Show file', () => window.hub.fs.reveal(m.loop), 'qj-quiet')); }
    const c = m.campaign && studioState()?.campaigns.find((x) => x.id === m.campaign);
    if (c) acts.append(button('Open the quest', () => { close(); const q = m.quest || c.quests.at(-1).id; kit.questDetail(q); }, 'qj-quiet'));
    if (m.kind === 'show' && typeof ShowPrep !== 'undefined') acts.append(button('My show log', () => { close(); ShowPrep.logDialog(kit); }, 'qj-quiet'));
    if (acts.children.length) card.append(acts);
    return card;
  }
  const secondLine = (m) => m.title && m.title !== m.place?.name; // a second line only when it says something new

  // ---------- the monthly recap ----------
  function grid(E, r) {
    const g = E('div', { class: 'pj-grid', attrs: { role: 'img', 'aria-label': `${r.arrCount} of 20 arrondissements this month` } });
    const top = Math.max(1, ...r.arrs);
    r.arrs.forEach((n, i) => { const c = E('span', { class: `pj-cell${n ? ' lit' : ''}${r.newArrs.includes(i + 1) ? ' new' : ''}`, text: K.arrLabel(i + 1) }); c.style.setProperty('--a', n ? (0.35 + 0.65 * n / top).toFixed(2) : 0); c.title = n ? `${K.arrLabel(i + 1)} · ${n} moment${n === 1 ? '' : 's'}${r.newArrs.includes(i + 1) ? ' · new' : ''}` : K.arrLabel(i + 1); g.append(c); });
    return g;
  }
  async function recapDialog(month, kit) {
    if (!kit) { await QuestParisUI.journal(); kit = ui(); }
    const { s, list: all } = await everything(), r = recapOf(s, all, month), { E, p, label, button } = kit;
    return kit.dialog(`My Paris · ${r.label}`, (body, d) => {
      d.classList.add('pj-dialog', 'pj-recap'); d.dataset.month = month;
      const tiles = E('div', { class: 'pj-tiles' });
      for (const t of K.card(r).tiles) { const x = E('div', { class: 'pj-tile' }, E('b', { text: String(t.n) }), E('span', { text: t.label })); x.style.setProperty('--c', t.color); tiles.append(x); }
      const bar = E('div', { class: 'pj-bar', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(r.explored.pct), 'aria-label': 'Paris explored' } }, E('i'));
      bar.firstChild.style.setProperty('--w', `${r.explored.pct}%`);
      body.append(tiles, label(`${r.arrCount} OF 20 ARRONDISSEMENTS${r.newArrs.length ? ` · ${r.newArrs.length} NEW` : ''}`), grid(E, r),
        label(`PARIS EXPLORED · ${r.explored.pct}% OF THE GUIDE${r.explored.gained ? ` · +${r.explored.gained} THIS MONTH` : ''}`), bar);
      if (r.newSpots.length) body.append(label('NEW THIS MONTH'), p(r.newSpots.join(' · ')));
      if (!r.total) body.append(p('Nothing on your map this month yet. Finish a place quest, keep a show night, walk a walk or record a park loop.'));
      const status = E('p', { class: 'qj-paris-best pj-saved' });
      const prev = K.shiftMonth(month, -1), next = K.shiftMonth(month, 1), cur = K.monthOf(Date.now());
      body.append(E('div', { class: 'qj-actions' },
        button('Save image card', async () => { const f = await saveCard(month); status.textContent = `Saved in your Pictures folder: ${f}`; status.append(' ', button('Show file', () => window.hub.fs.reveal(f), 'qj-quiet')); }, 'qj-primary pj-save'),
        button('On the map', () => { d.close(); setMonth(month); if (J()?.page !== 'world') J().paris.mapFilter({}); }, 'qj-quiet'),
        button(`‹ ${K.monthName(prev, true)}`, () => { d.close(); recapDialog(prev, kit); }, 'qj-quiet'),
        next <= cur ? button(`${K.monthName(next, true)} ›`, () => { d.close(); recapDialog(next, kit); }, 'qj-quiet') : ''), status);
      body.append(p('The card is drawn on this computer and saved as a picture for you to share. Hearth never uploads it.', 'qj-paris-best'));
    }, 'MY PARIS / MONTHLY RECAP');
  }

  // ---------- the image card: drawn offline in the window, written to your Pictures folder ----------
  async function photoBitmap(file) {
    try { const b = await window.hub.fs.read(file, { encoding: 'buffer', maxBytes: 40 * 1048576 }); return await createImageBitmap(new Blob([b])); } catch { return null; }
  }
  async function drawCard(r) {
    const c = K.card(r), W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), F = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1b1a1f'); bg.addColorStop(1, '#0d0d10'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(217,183,119,.35)'; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
    g.fillStyle = '#d9b777'; g.font = F(700, 30); g.fillText('MY PARIS', 84, 120);
    g.fillStyle = '#f4efe6'; g.font = F(800, 84); g.fillText(c.month, 80, 210);
    // four tiles
    c.tiles.forEach((t, i) => { const x = 84 + i * 232, y = 260; g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, y, 212, 150); g.fillStyle = t.color; g.fillRect(x, y, 212, 6); g.font = F(800, 72); g.fillText(String(t.n), x + 20, y + 92); g.fillStyle = '#c9c4ba'; g.font = F(500, 26); g.fillText(t.label, x + 20, y + 132); });
    // the 20 arrondissements (5 × 4)
    g.fillStyle = '#d9b777'; g.font = F(700, 26); g.fillText(`${c.arrs.filter(Boolean).length} OF 20 ARRONDISSEMENTS`, 84, 470);
    const top = Math.max(1, ...c.arrs);
    c.arrs.forEach((n, i) => { const x = 84 + (i % 5) * 184, y = 492 + Math.floor(i / 5) * 92; g.fillStyle = n ? `rgba(255,177,74,${(0.3 + 0.7 * n / top).toFixed(2)})` : 'rgba(255,255,255,.06)'; g.fillRect(x, y, 172, 80);
      if (c.newArrs.includes(i + 1)) { g.strokeStyle = '#ff6b9d'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, 168, 76); }
      g.fillStyle = n ? '#141416' : '#77736c'; g.font = F(800, 32); g.fillText(K.arrLabel(i + 1), x + 16, y + 52); });
    // Paris explored
    g.fillStyle = '#d9b777'; g.font = F(700, 26); g.fillText(`PARIS EXPLORED · ${c.explored.pct}% OF THE GUIDE${c.explored.gained ? ` (+${c.explored.gained})` : ''}`, 84, 900);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(84, 920, 912, 22); g.fillStyle = '#7ee0a8'; g.fillRect(84, 920, Math.round(912 * c.explored.pct / 100), 22);
    let y = 1000;
    const fit = (text, max) => { let t = text; while (g.measureText(t).width > max && t.length > 4) t = t.slice(0, -2); return t === text ? t : `${t.trimEnd()}…`; };
    if (c.fresh.length) { g.fillStyle = '#d9b777'; g.font = F(700, 26); g.fillText('NEW THIS MONTH', 84, y); g.fillStyle = '#f4efe6'; g.font = F(500, 30); g.fillText(fit(c.fresh.join(' · '), 912), 84, y + 44); y += 96; }
    if (c.best) { g.fillStyle = '#ffb14a'; g.font = F(700, 30); g.fillText(fit(`${'★'.repeat(c.best.rating)}  ${c.best.title}`, 912), 84, y); if (c.best.note) { g.fillStyle = '#c9c4ba'; g.font = F(400, 26); g.fillText(fit(`“${c.best.note}”`, 912), 84, y + 40); } y += 90; }
    // up to three of your photos, cropped square (read from disk here; the canvas never touches the network)
    const pics = (await Promise.all(c.photos.map(photoBitmap))).filter(Boolean);
    if (pics.length && y < 1150) { const s = Math.min(150, 1260 - y); pics.forEach((bm, i) => { const k = Math.min(bm.width, bm.height), x = 84 + i * (s + 16); g.drawImage(bm, (bm.width - k) / 2, (bm.height - k) / 2, k, k, x, y - 10, s, s); bm.close?.(); }); }
    g.fillStyle = '#77736c'; g.font = F(500, 22); g.fillText('Hearth · Sidequest Studio', 84, H - 64);
    return cv;
  }
  async function saveCard(month) {
    const { s, list: all } = await everything(), r = recapOf(s, all, month), cv = await drawCard(r);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png')); if (!blob) throw Error('The card could not be drawn.');
    const home = await window.hub.fs.home(), dir = WinMac.join(home, 'Pictures', 'Hearth', 'My Paris'), file = WinMac.join(dir, K.fileName(month));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await window.hub.fs.write(file, bytes);
    lastCard = file; _test.saved.push({ file, bytes: bytes.length, w: cv.width, h: cv.height });
    return file;
  }

  // ---------- chat: /paris ----------
  const HELP = 'My Paris: /paris (your map journal on the Paris map) · /paris month [october | last | 2026-09] (the recap: places, shows, walks, park sessions, the 20 arrondissements, Paris explored) · /paris card [month] (saves the image card in Pictures › Hearth › My Paris; never uploaded) · /paris off';
  async function run(args, ctx) {
    const t = String(args || '').trim(), [w0, ...rest] = t.split(/\s+/), sub = K.fold(w0);
    const say = (text, actions) => (ctx?.note ? ctx.note(text, { actions, id: 'parisjournal' }) : ctx?.say ? ctx.say(text) : toast(text));
    if (sub === 'help' || sub === '?') return HELP;
    if (sub === 'off' || sub === 'hide') { toggle(false); return 'My Paris is off the map (your records are untouched). /paris puts it back.'; }
    if (!sub || sub === 'map' || sub === 'on' || sub === 'show') {
      const m = rest.length ? K.parseMonth(rest.join(' ')) : null;
      await QuestParisUI.journal(); prefs.on = true; if (m) prefs.month = m; savePrefs(); J().paris.mapFilter({}); await loadTakes(); redraw();
      const all = moments(studioState()), shown = all.filter((x) => !prefs.month || x.month === prefs.month);
      return all.length ? `My Paris is on the map: ${shown.length} moment${shown.length === 1 ? '' : 's'}${prefs.month ? ` in ${K.monthName(prefs.month)}` : ''}. Pick a month in the strip under the map; tap a pin for the moment.` : 'My Paris is on the map, still empty: finish a place quest, keep a show night (/shows went), walk a walk or record a park loop.';
    }
    const card = ['card', 'image', 'export', 'png', 'share'].includes(sub);
    const word = sub === 'month' || sub === 'recap' || card ? rest.join(' ') : t;
    const month = K.parseMonth(word); if (!month) return `“${word}” isn't a month I know. Try /paris month october, /paris month last or /paris month 2026-09.`;
    if (card) { const f = await saveCard(month); say(`Saved your ${K.monthName(month)} card: ${f}. It stays on this computer until you share it.`, [{ label: 'Show file', run: () => window.hub.fs.reveal(f) }]); return; }
    const { s, list: all } = await everything(), r = recapOf(s, all, month);
    say(K.recapText(r), [
      { label: 'Save image card', run: () => saveCard(month).then((f) => ctx?.say?.(`Saved: ${f}`)).catch((err) => ctx?.say?.(calmError(err))) },
      { label: 'Recap card', run: () => recapDialog(month).catch((err) => ctx?.say?.(calmError(err))) },
      { label: 'On the map', run: () => run(`map ${month}`, ctx).then((x) => x && ctx?.say?.(x)) },
    ]);
  }
  function complete(args) {
    const t = String(args || ''), words = t.split(/\s+/);
    if (words.length <= 1) return [['month', 'the monthly recap'], ['card', 'save the image card'], ['map', 'on the Paris map'], ['off', 'off the map'], ['help', 'all the words']].filter(([v]) => v.startsWith(K.fold(words[0]))).map(([value, hint]) => ({ value, hint }));
    const base = words[0], m = K.months(memo.list).map((x) => x.label.toLowerCase());
    return ['this', 'last', ...m].filter((x) => x.startsWith(K.fold(words.slice(1).join(' ')))).slice(0, 10).map((x) => ({ value: `${base} ${x}` }));
  }
  if (!Commands.get('paris')) {
    Commands.register({ name: 'paris', args: '[month [name] | card [month] | map [month] | off]', area: 'Create',
      desc: 'My Paris: your map journal of what you actually did (place quests, shows, walks, park sessions) and a monthly recap with an image card you can share', run, complete,
      examples: ['/paris', '/paris month', '/paris month september', '/paris card last'], keywords: 'paris journal map month recap arrondissement explored shows walks park card image share my paris' });
  }
  try { AppUI.addAction?.('Quest: My Paris this month', () => run('month', null).catch((err) => toast(calmError(err), { type: 'error' }))); } catch { /* the palette isn't there */ }
  // a new park take → read the park folders again next time the map draws (no timer)
  document.addEventListener('hearth:quest-week', (e) => { if (e.detail?.kind === 'park-jam') { takes = null; memo.s = null; if (prefs.on) redraw(); } });
  redraw();
  return { run, complete, layer, recapDialog, saveCard, drawCard, openMoments, moments: () => moments(studioState()), everything, toggle, setMonth, get prefs() { return { ...prefs }; }, get lastCard() { return lastCard; }, reloadTakes: () => loadTakes(true).then(redraw), _test };
})();
