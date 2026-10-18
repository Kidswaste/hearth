// (round 62, weekquest62) The week plan's background part, kept tiny (it rides in the tracker's lazy group): the ONE
// gentle nudge and the Sunday-evening offer. Everything else (the card, the review, /quest week | review) loads on first
// use (lazy group 'weekquest').
//   · The nudge: off until the owner turns it on in the week card. Then exactly one timer exists, set for the next
//     planned day's chosen time (07:00–22:00); it fires at most once a day (the day is written into the journal, so a
//     second computer syncing it stays quiet too). It goes through Hearth's desktop notifications (notifymain.js: the
//     OS's own Focus / Do Not Disturb holds it; the "Desktop notifications" master switch off = no nudge); when Hearth is
//     in front it's a small toast instead. No plan, nudge off, or nothing open that day: no timer at all.
//   · Sunday from 17:00, when Hearth opens or comes back to the front and next week has no plan yet: one quiet offer
//     through Hints ("Plan my week"), once per week. No timer: it's checked on those two moments only.
// Reads the journal the tracker already holds (QuestHud.journal()); re-arms on every 'hearth:quests' change.
const WeekNudge = (() => {
  const W = WeekQuestCore;
  let timer = 0, armedFor = null, firing = false, now = () => Date.now(); // now: (checks) a clock that can be set
  const J = () => (typeof QuestHud !== 'undefined' ? QuestHud.journal() : { C: null, S: null, status: 'unknown' }); // (same lazy group: a const, not on window)
  // the "Desktop notifications" master switch (Settings › Advanced › Tell me when…): off = no nudge
  async function masterOn() { const st = typeof H !== 'undefined' && H.settings ? H.settings() : {}; try { await Lazy.load('notify'); return NotifyCore.prefs(st).on; } catch { return st?.notify !== false; } }

  // One timer at most, and only when there's something to nudge about
  function arm() {
    const { C, S, status } = J();
    const next = status === 'ok' && C && S ? W.nextNudge(C, S, now()) : null;
    const sig = next ? `${next.day}|${next.at}|${next.quest}` : null;
    if (sig === armedFor) return next; // nothing changed: keep the timer as it is
    clearTimeout(timer); timer = 0; armedFor = sig;
    if (next) timer = setTimeout(fire, Math.max(0, Math.min(next.at - now(), 2 ** 31 - 1)));
    return next;
  }
  async function fire() {
    timer = 0; armedFor = null;
    if (firing) return; firing = true;
    try {
      const { C, S } = J(); if (!C || !S) return;
      const due = W.nextNudge(C, S, now());
      if (!due || due.at > now() + 1000) return; // the plan changed (or the computer slept past the window)
      // mark the day first: never twice, even if showing fails
      await QuestHud.write((s) => { W.setNudge(s, { last: due.day }); W.checkWeekly(s.weekly); }, 'Nudge noted.');
      const q = C.find(QuestHud.journal().S, due.quest);
      const step = q ? (C.record(QuestHud.journal().S, q.id).startedAt ? q.done : (QuestHud.journal().S.tiny?.[q.id] || q.tiny)) : '';
      const title = `✦ Today: ${due.item}`, body = `${q && q.title !== due.item ? `${q.title} · ` : ''}${step || 'One small step is enough.'}`.slice(0, 160);
      let shown = false, why = '';
      if ((await masterOn()) && window.hub?.notify) { const r = await window.hub.notify.send({ type: 'quest', title, body, group: 'quest-nudge' }).catch((err) => ({ shown: false, why: err.message })); shown = Boolean(r?.shown); why = r?.why || ''; }
      if (!shown && why === 'focused') toast(`${title} · ${body}`, { timeout: 9000, action: { label: 'Tracker', fn: () => QuestHud.open() } });
      log.push({ at: now(), day: due.day, quest: due.quest, shown, why });
      if (log.length > 20) log.shift();
    } catch (err) { console.warn('weekquest: nudge', err); } finally { firing = false; arm(); }
  }
  const log = []; // (checks) what each firing did

  // Sunday evening: offer to plan the coming week, once
  function sunday() {
    const now = new Date(); if (now.getDay() !== 0 || now.getHours() < 17) return;
    const { C, S, status } = J(); if (status !== 'ok' || !C || !S) return;
    const { week } = W.planWeek(now.getTime());
    if (W.planOf(S, week)?.items.length) return;
    const show = () => toast('✦ Plan next week’s quests? Hearth proposes 3–5 from your shows, places and open quests.', { timeout: 20000, action: { label: 'Plan my week', fn: () => Lazy.load('weekquest').then(() => WeekQuest.open('week')) } });
    if (window.Hints) Hints.offer({ id: `weekquest:sunday:${week}`, rank: 40, ttl: 3 * 3600e3, show }); else show();
  }

  // Sidequest Studio › Collection › Week pages: the saved weeks in review, newest first, in the Studio's own look
  // (kit = the journal's E / label / p helpers; quest-journal.js calls this from its collection page)
  function pages(kit, s) {
    const list = [...(s?.weekly?.reviews || [])].reverse(); if (!list.length) return null;
    const { E, label, p } = kit;
    const fold = E('details', { class: 'qj-fold wq-pages', open: true }, E('summary', { text: `Week pages · ${list.length}` }));
    for (const r of list.slice(0, 26)) fold.append(E('article', { class: 'qj-card qj-keepsake wq-page' }, label(`WEEK OF ${W.label(r.week).toUpperCase()}`),
      E('h3', { text: `${r.done.length} done · +${r.xp} XP · ${r.streak}-week streak` }),
      r.done.length ? p(r.done.map((d) => `${d.life ? '☀' : '✓'} ${d.title}`).join(' · ')) : null,
      r.moments.length ? p(`Moments: ${r.moments.map((m) => m.what).join(' · ')}`) : null,
      r.reflection ? E('blockquote', { class: 'wq-quote' }, label(r.prompt), E('p', { text: r.reflection })) : null));
    return fold;
  }

  document.addEventListener('hearth:quests', () => queueMicrotask(arm));
  addEventListener('focus', sunday);
  queueMicrotask(() => { if (J().status === 'ok') { arm(); sunday(); } });
  return { pages, arm: () => { const n = arm(); sunday(); return n; }, fire, get armed() { return armedFor; }, get timer() { return Boolean(timer); }, log, _test: { clock(fn) { now = fn || (() => Date.now()); armedFor = undefined; return arm(); } } };
})();
