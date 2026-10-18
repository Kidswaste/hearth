// (round 62, weekquest62) The weekly quest rhythm in the app: no timer while the nudge is off; /quest week opens the card
// with 3–5 proposals (a fixture show of this week, a place near its venue, an open personal quest, the park); Accept puts
// a quest on its day (saved in Codex's journal, nothing else), dragging a proposal onto another day plans it there, a
// planned chip moves between days; the ✦ chip follows today's planned quest; the nudge: off by default, on from the card,
// one timer only, fires once (desktop notification recorder), never twice the same day; /quest review shows done / XP /
// streak / moments, saves a week page with the reflection, and Sidequest Studio › Collection shows it.
//   node dev/smoke.js --script dev/checks/weekquest62.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const agent = H.claudeAgent().id;
const run = (line) => Commands.tryRun(line, agent);
const card = () => document.querySelector('.wq-panel');
const chip = () => document.querySelector('#rail .qh-chip');
const disk = async () => (await window.hub.kvGet('quest-journal')) || {};
const shotDir = window.SMOKE_TMP || window.SMOKE_SAVES;

// timers made by the week plan (by the stack: weekquest*.js)
const T = { n: 0, what: [] };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
  const orig = window[name]; if (!orig) continue;
  window[name] = function (...a) { const st = new Error().stack || ''; if (/weekquest/.test(st)) { T.n++; T.what.push(`${name}:${a[1] ?? ''}`); } return orig.apply(this, a); };
}

// ---------- 1. a journal with an open personal quest; nudge off → no timer ----------
await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
await Lazy.load('questjournal');
const C = QuestCore, W = WeekQuestCore;
const seed = C.upgrade(C.initial()); QuestParis.startPersonal(seed, 'airpods'); seed.active = 'c-material';
await window.hub.kvSet('quest-journal', seed);
await QuestHud.refresh(); WeekNudge.arm();
const t0 = T.n; document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: C.clone(seed), source: 'check' } })); await wait(900);
step('nudge off (the default): no timer at all, even after a journal change', !WeekNudge.timer && WeekNudge.armed == null && T.n === t0, { timers: T.n - t0, armed: WeekNudge.armed });
step('week plan code beyond the tiny nudge part is not loaded until used', !Lazy.isIn('weekquest'));

// fixtures: one show on the next plannable evening (showsync61's shape), no forecast reachable
await Lazy.load('weekquest');
const wk = W.planWeek(Date.now()), showDay = wk.days[wk.days.indexOf(wk.from) + 1] || wk.from;
const showStart = W.parse(showDay).getTime() + 20 * 3600e3;
WeekQuest._test.shows = [{ key: 'chk-cigale', title: 'Check Night', start: showStart, venue: { name: 'La Cigale', address: '120 Bd de Rochechouart, 75018 Paris', lat: 48.8823, lon: 2.3404, key: 'la cigale' }, lineup: ['Check Band'], tickets: [{ platform: 'shotgun', url: 'https://shotgun.live/en/events/check-night' }], platforms: ['shotgun'], cancelled: false }];
WeekQuest._test.weather = null;

// ---------- 2. /quest week: the card with 3–5 proposals ----------
await run('/quest week');
await until(() => card() && card().querySelector('.wq-days'), 'the week card');
const props = () => [...card().querySelectorAll('.wq-prop')];
step('/quest week opens a small card beside the rail with the week\'s 7 days', vis(card()) && card().querySelectorAll('.wq-day').length === 7 && card().getBoundingClientRect().left >= document.getElementById('rail').getBoundingClientRect().right - 1);
step('it proposes 3–5 quests', props().length >= 3 && props().length <= 5, props().map((r) => r.textContent.slice(0, 50)));
const kinds = WeekQuest.state().props.map((p) => p.kind);
step('from this week\'s show, a place near its venue, the open personal quest and the park', kinds.includes('show') && kinds.includes('place') && kinds.includes('personal') && kinds.includes('park'), kinds);
step('the place near the show is on the show\'s night', WeekQuest.state().props.find((p) => p.kind === 'place')?.day === showDay, WeekQuest.state().props.find((p) => p.kind === 'place'));
step('the chat got the plan too', (document.querySelector('.surface.active')?.textContent || '').includes('Check Band'));
await smoke({ shot: `${shotDir}/weekquest-card.png` });

// ---------- 3. accept → its day; drag → another day; a chip between days ----------
const showRow = props().find((r) => r.dataset.prop === 'show-chk-cigale');
showRow.querySelector('.wq-accept').click();
await until(async () => (await disk()).weekly?.plans?.find((p) => p.week === wk.week)?.items.some((x) => x.campaign === 'c-show-chk-cigale'), 'show accepted on disk');
let d = await disk();
step('Accept: the show is planned on its night, as a real show quest in the journal', d.weekly.plans.find((p) => p.week === wk.week).items.find((x) => x.campaign === 'c-show-chk-cigale').day === showDay && d.campaigns.some((c) => c.id === 'c-show-chk-cigale'));
step('accepting never changes the main quest you track', d.active === 'c-material', d.active);
await until(() => card().querySelector(`.wq-day[data-day="${showDay}"] .wq-chip`), 'chip on the show day');
step('its chip shows on that day in the card', Boolean(card().querySelector(`.wq-day[data-day="${showDay}"] .wq-chip`)));
const dropDay = wk.days.at(-1) === showDay ? wk.days.at(-2) : wk.days.at(-1);
const drag = (src, dst) => { const dt = new DataTransfer(); src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); };
const pRow = props().find((r) => r.dataset.prop === 'pq-airpods');
drag(pRow, card().querySelector(`.wq-day[data-day="${dropDay}"]`));
await until(async () => (await disk()).weekly.plans.find((p) => p.week === wk.week).items.some((x) => x.campaign === 'c-pq-airpods' && x.day === dropDay), 'dragged proposal planned');
step('drag a proposal onto a day: planned on that day', true, dropDay);
const moveTo = wk.days.find((x) => x >= wk.from && x !== dropDay && x !== showDay) || showDay;
await until(() => card().querySelector('.wq-chip[data-item="wk-pq-airpods"]'), 'airpods chip');
drag(card().querySelector('.wq-chip[data-item="wk-pq-airpods"]'), card().querySelector(`.wq-day[data-day="${moveTo}"]`));
await until(async () => (await disk()).weekly.plans.find((p) => p.week === wk.week).items.find((x) => x.id === 'wk-pq-airpods')?.day === moveTo, 'chip moved');
step('drag a planned chip to another day: moved', true, moveTo);
step('the journal is still valid for Codex\'s rules', (() => { try { C.validate(d); W.checkWeekly(d.weekly); return true; } catch (e) { return e.message; } })() === true);

// ---------- 4. the ✦ chip shows today's planned quest ----------
const today = C.day();
await QuestHud.write((s) => { const r = W.accept(C, s, W.monday(today), { id: 'today-drink', kind: 'personal', title: 'Offer someone a drink', campaign: 'c-pq-drink', personal: 'drink' }, today, { personal: (x, k) => QuestParis.startPersonal(x, k) }); W.checkWeekly(s.weekly); return r; });
await until(() => /^Today's quest:/.test(chip()?.getAttribute('aria-label') || ''), 'chip follows today');
const drink = QuestHud.journal().S.campaigns.find((c) => c.id === 'c-pq-drink');
step('the ✦ chip follows today\'s planned quest', chip().getAttribute('aria-label').includes(drink.quests[0].title) && QuestHud.journal().S.active === 'c-material', chip().getAttribute('aria-label'));

// ---------- 5. the nudge: off → on in the card; one timer; fires once; never twice a day ----------
await window.hub.notify.test({ stub: true, away: true, clear: true });
step('still no nudge timer while the switch is off', !WeekNudge.timer);
const box = card().querySelector('.wq-nudge');
step('the card has the nudge switch, off', Boolean(box) && !box.checked);
box.click();
await until(async () => (await disk()).weekly.nudge.on === true, 'nudge on saved');
await until(() => WeekNudge.timer, 'one timer armed');
step('turning it on arms exactly one timer (for a planned day)', WeekNudge.timer && Boolean(WeekNudge.armed), WeekNudge.armed);
const tBefore = T.n;
for (let i = 0; i < 4; i++) document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: QuestHud.journal().S, source: 'check' } }));
await wait(300);
step('journal changes don\'t stack timers (same plan: the timer is kept)', T.n === tBefore, { new: T.n - tBefore });
// set the clock to 30 min after today's nudge time: due now (a late opening within 2 h)
const nudgeTime = (await disk()).weekly.nudge.time; const [hh, mm] = nudgeTime.split(':').map(Number);
const fake = W.parse(today).getTime() + (hh * 60 + mm + 30) * 60000;
WeekNudge._test.clock(() => fake);
await until(async () => (await disk()).weekly.nudge.last === today, 'nudge fired and noted', 200);
await wait(300);
let log = (await window.hub.notify.test({})).log.filter((n) => /Today/.test(n.shown?.title || ''));
step('the nudge fires once through Hearth\'s notifications', log.length === 1 && /Today: Offer someone a drink/.test(log[0].shown.title), { log: log.map((n) => n.shown.title), nudge: WeekNudge.log });
WeekNudge._test.clock(() => fake + 60000); WeekNudge.arm(); await WeekNudge.fire(); await wait(300);
log = (await window.hub.notify.test({})).log.filter((n) => /Today/.test(n.shown?.title || ''));
step('never twice the same day', log.length === 1, log.length);
step('the next nudge is armed for another planned day (or none)', !WeekNudge.armed || !WeekNudge.armed.startsWith(today), WeekNudge.armed);
WeekNudge._test.clock(null);
card().querySelector('.wq-nudge').click();
await until(async () => (await disk()).weekly.nudge.on === false, 'nudge off saved');
await until(() => !WeekNudge.timer, 'timer cleared');
step('switching it off clears the timer', !WeekNudge.timer);
await window.hub.notify.test({ stub: false, away: null });

// ---------- 6. /quest review: done, XP, streak, moments, reflection → a week page in the journal ----------
const dq = drink.quests[0];
await QuestHud.write((s) => {
  const proof = { type: 'file', title: 'Field note from the bar', excerpt: 'Said hi, asked about the record playing. Nice chat.', analysis: '', coverage: '', fingerprint: 'b'.repeat(64), images: [], path: '/tmp/weekquest-note.txt', kind: 'text', bytes: 51 };
  C.submit(s, dq.id, proof, 'one kind hello'); const st = s.studio; delete s.studio; C.complete(s, dq.id); s.studio = st;
});
WeekQuest.close();
await run('/quest review');
await until(() => card()?.querySelector('.wq-stats'), 'the review card');
const stats = [...card().querySelectorAll('.wq-stat b')].map((b) => b.textContent);
step('/quest review: done count, XP, streak of real-life weeks', stats[0] === '1' && Number(stats[1].slice(1)) >= dq.xp && stats[2] === '1', stats);
step('today\'s planned quest counts as done in the plan line', /Planned: 1 of \d+ done/.test(card().textContent), card().querySelector('.wq-stats')?.nextElementSibling?.textContent);
step('moments: the proof note collected', card().querySelector('.wq-moments')?.textContent.includes('Field note from the bar'));
step('a one-line reflection prompt', W.PROMPTS.includes(card().querySelector('.wq-reflect .qh-k')?.textContent));
await smoke({ shot: `${shotDir}/weekquest-review.png` });
const input = card().querySelector('.wq-reflect input'); input.value = 'Saying hi was easier than I thought.';
card().querySelector('.wq-save').click();
await until(async () => (await disk()).weekly?.reviews?.length === 1, 'week page saved');
d = await disk();
step('Save to journal: one week page with the reflection', d.weekly.reviews[0].reflection === 'Saying hi was easier than I thought.' && d.weekly.reviews[0].week === W.reviewWeek(Date.now()), d.weekly.reviews[0]);
WeekQuest.close();
await QuestHud.openStudio(null, 'collection');
await until(() => document.querySelector('.wq-pages'), 'week pages in the Studio');
step('Sidequest Studio › Collection shows the week page', document.querySelector('.wq-pages').textContent.includes('Saying hi was easier'));
activate(agent); await wait(200);

// ---------- 7. idle: nothing ticking ----------
const tIdle = T.n; await wait(1500);
step('idle again: no week-plan timers', T.n === tIdle && !WeekNudge.timer, T.what.slice(-5));
step('no AI was asked (nothing costs tokens unless "Suggest more")', !(WeekQuest.state().aiNote));
await QuestJournal.flush?.();
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
