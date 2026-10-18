// (round 64, clickfirst64) Click first: the owner said "I really don't use commands at all." Rounds 61–63 added a lot
// behind chat commands (/quest week, /quest review, /quest walk, /reward, /shows prep|went|log, /jam park, /song,
// /sounds, /playtest notes|hitchmap). This file puts each of them where the owner already looks, with words on the
// buttons, and no new rows of buttons:
//   · the ✦ tracker panel: a "This week" part (Plan your week / See the plan, Week in review ›, Make a walk), a
//     labelled "More" menu with every quest feature, and buttons on the quest card that fit the quest (a show:
//     Get ready / How was it?; the park quest: Park mode; Finish a track: Arrange loops; a walk: See the walk)
//   · Sidequest Studio: one "My week ▾" button in its top bar (the same menu)
//   · the Lab toolbar's ⋯: "▶ Playtest" (Playtest log, Record the hitch map, Hitch map)
// (The Sound desk's Sound bank / Arrange loops buttons sit in tools/parkjam.js beside Park mode; the game window's F
// chip got its "✎ Note" / "● Record hitch map" in game-preload.js.) The commands all still work; nothing here types one.
// Cost while idle: nothing (no timers, no listeners of its own; it only builds rows when the panel or a menu draws).
const ClickFirst = window.ClickFirst = (() => { // (on window too: the Studio asks for it with window.ClickFirst?.)
  const fail = (err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error' });
  const run = (fn) => () => Promise.resolve().then(fn).catch(fail);
  const say = (t) => { if (t && typeof t === 'string') toast(t, { timeout: 4000 }); };
  const QH = () => (typeof QuestHud !== 'undefined' ? QuestHud : null);
  const close = () => QH()?.close?.();

  // ---------- the actions (each one is one click; none of them types a command) ----------
  async function weekCard(mode) { close(); await Lazy.load('weekquest'); return WeekQuest.open(mode); } // 'week' | 'review'
  async function studio(page = null) { close(); return QH().openStudio(null, page); }
  // the Studio open and ready (its kit is what the Paris / shows dialogs draw with)
  async function studioReady() {
    close(); await QH().openStudio();
    for (let i = 0; i < 120 && !(typeof QuestJournal !== 'undefined' && QuestJournal.ready?.()); i++) await new Promise((r) => setTimeout(r, 50));
    if (!(typeof QuestJournal !== 'undefined' && QuestJournal.ready?.())) throw Error('Sidequest Studio isn’t ready yet. Try again in a moment.');
    const ui = QuestJournal.paris?.ui?.(); return ui ? { ...ui, mutate: QuestJournal.mutate } : null;
  }
  async function walk() { await studioReady(); return QuestWalk.start(); }
  async function seeWalk() { await studio('world'); return QuestWalk.dialog(); }
  async function showsWeek() { const kit = await studioReady(); await ShowSync.ensure?.().catch(() => {}); return ShowSync.listDialog(kit); }
  async function showCard(which, key) { close(); await Lazy.load('questjournal'); return ShowPrep.openCard(which, key); }
  async function creative() { close(); await Lazy.load('creative'); }
  async function parkMode() { await creative(); return say(await ParkJam.on()); }
  async function arrange() { await creative(); return say(await LoopSong.command('')); }

  // ---------- one menu for the quest features: the tracker's "More" and the Studio's "My week ▾" ----------
  function questItems() {
    return [
      { label: 'Plan my week…', hint: '3–5 quests on the days that suit them', action: run(() => weekCard('week')) },
      { label: 'Week in review…', hint: 'what you did, XP, your streak', action: run(() => weekCard('review')) },
      { label: 'Make a walk…', hint: '3–5 places you haven’t been, Métro to Métro', action: run(walk) },
      { label: 'My rewards…', hint: 'XP to your next reward, the jar', action: run(() => studio('rewards')) },
      { label: 'Shows this week…', hint: 'Paris, from Shotgun and DICE', action: run(showsWeek) },
      { label: 'Shows I went to…', hint: 'your nights, stars and moments', action: run(() => showCard('log')) },
      '-',
      { label: '🌳 Park mode…', hint: 'music outside on the laptop (Sound desk)', action: run(parkMode) },
      { label: 'Arrange park loops…', hint: 'your park takes → a song', action: run(arrange) },
    ];
  }
  // Sidequest Studio's top bar: one labelled button (the same menu, plus the tracker itself)
  function studioButton(button) {
    const b = button('My week ▾', () => { const r = b.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [{ label: '✦ Quest tracker', hint: WinMac.keyLabel('Ctrl/⌘+Shift+O'), action: () => QH()?.open() }, ...questItems()]); }, 'qj-quiet cf-studio-week');
    b.title = 'Plan your week, the week in review, a walk, rewards, shows, the park';
    return b;
  }

  // ---------- the ✦ tracker panel: "This week" ----------
  const sec = (title, link, fn, k) => el('div', { class: 'qh-sec cf-sec' }, el('span', { text: title }),
    link ? el('button', { type: 'button', class: 'cf-link', text: `${link} ›`, dataset: { k }, on: { click: (e) => { e.stopPropagation(); run(fn)(); } } }) : null);
  const row = (icon, title, sub, action, cls = '') => el('div', { class: `qh-row cf-row ${cls}` }, el('span', { class: 'qh-pi', text: icon }),
    el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: title }), sub ? el('span', { class: 'qh-sub', text: sub }) : null), action);
  function itemDone(C, S, it) {
    try { if (it.campaign) { const c = S.campaigns.find((x) => x.id === it.campaign); return Boolean(c && C.campaignDone(S, c)); } return Boolean(C.done(S, it.quest)); } catch { return false; }
  }
  function weekRows(C, S, btn) {
    const W = window.WeekQuestCore; if (!W || !C || !S) return [];
    const pw = W.planWeek(), items = W.planOf(S, pw.week)?.items || [], next = pw.week > pw.today;
    const out = [sec(next ? 'Next week' : 'This week', 'Week in review', () => weekCard('review'), 'cf-review')];
    if (!items.length) {
      out.push(row('📅', 'No plan yet', '3–5 quests on days: shows, Paris places, the park',
        btn('Plan your week', () => weekCard('week'), 'qh-primary cf-take cf-plan', 'Plan your week: 3–5 quests on the days that suit them'), 'cf-week'));
    } else {
      const done = items.filter((it) => itemDone(C, S, it)).length;
      const ahead = items.filter((it) => !itemDone(C, S, it) && it.day >= pw.today).sort((a, b) => a.day.localeCompare(b.day))[0];
      out.push(row('📅', `${done} of ${items.length} planned done`, ahead ? `${ahead.day === pw.today ? 'Today' : W.weekday(ahead.day)} · ${ahead.title}` : done === items.length ? 'All done ✓' : 'Nothing left ahead this week',
        btn('See the plan', () => weekCard('week'), 'cf-take cf-plan', 'Your week plan: move, add, take off'), 'cf-week'));
    }
    out.push(row('⇢', 'A walk', '3–5 places you haven’t been, about 2 h', btn('Make a walk', walk, 'cf-take cf-walk', 'A walk through Paris places you haven’t visited (about 2 h)'), 'cf-walkrow'));
    return out;
  }
  // buttons on the quest card that fit the quest (a show night, the park, finishing a track, a walk)
  function cardActions(cd, btn) {
    const id = cd?.campaignId || '';
    let kids = [];
    if (id.startsWith('c-show-')) { const key = id.slice(7); kids = [btn('Get ready', () => showCard('prep', key), 'cf-act', 'Calendar, Métro, the lineup, a reminder'), btn('How was it?', () => showCard('went', key), 'cf-act', 'Stars, one moment, a photo: the quest’s proof')]; }
    else if (id === 'c-pq-park') kids = [btn('🌳 Park mode', parkMode, 'cf-act', 'The Sound desk set up for the park: laptop output, safe buffer, battery'), btn('Arrange loops', arrange, 'cf-act', 'Your park takes → a song')];
    else if (id === 'c-pq-track') kids = [btn('Arrange loops', arrange, 'cf-act', 'Your park takes → a song, then export it')];
    else if (id.startsWith('c-walk-')) kids = [btn('See the walk', seeWalk, 'cf-act', 'The stops, the walking route, the next stop')];
    return kids.length ? el('div', { class: 'cf-acts' }, ...kids) : null;
  }

  // ---------- the Lab toolbar's ⋯: ▶ Playtest (notes and the hitch map) ----------
  async function gm() { await Lazy.load('gamemode'); }
  function labRow() {
    const on = store.get('hitchmap.on', false) === true;
    return ['▶ Playtest', 'Notes (F8 while you play) and where it stutters', [
      ['✎ Playtest log', 'Your F8 notes with their pictures · a click jumps back there', run(async () => { await gm(); return PlayNotes.open(); })],
      ['● Record the hitch map', 'Off by default · while on, ▶ Play records where it stutters', run(async () => { await gm(); say(await HitchMap.set(!HitchMap.isOn())); }), on],
      ['▦ Hitch map', 'The last recording of this scene', run(async () => { await gm(); return HitchMap.open(); })]]];
  }

  return { questItems, studioButton, weekRows, cardActions, labRow, walk, showsWeek, parkMode, arrange };
})();
