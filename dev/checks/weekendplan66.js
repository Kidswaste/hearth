// (round 66, weekendplan66) 🗓 Plan my weekend in the app, on a throwaway profile (smoke.js's own fresh data folder):
// the ✦ tracker's panel shows the button only from Thursday 17:00 to Sunday (a check clock: WeekendPlanCore.setClock);
// the card's code loads on first click; offline, it plans from the saved shows and says so (no forecast asked); the plan
// is balanced (Fri show, Sat park + a place near it at 17:00, Sun studio session on the open music project); Swap and
// Keep work by clicking; Accept plan saves the kept slots as quests on the week plan with their times (Codex's journal
// still valid, the main quest kept, nearby left out), accepting twice adds nothing; /quest weekend lists it in the chat.
//   node dev/smoke.js --script dev/checks/weekendplan66.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const agent = H.claudeAgent().id;
const shotDir = window.SMOKE_TMP || window.SMOKE_SAVES;
const disk = async () => (await window.hub.kvGet('quest-journal')) || {};
const hudBtn = () => [...document.querySelectorAll('.qh-panel .wp-hud')].find(vis);
const card = () => document.querySelector('.wp-panel');
const slot = (id) => card()?.querySelector(`.wp-slot[data-slot="${id}"]`);

// ---------- 1. a journal; the clock at points of the week ----------
await until(() => Lazy.isIn('questhud') && typeof WeekendPlanCore !== 'undefined', 'the tracker loads after the first screen');
await Lazy.load('questcore');
const C = QuestCore, WP = WeekendPlanCore, W = WeekQuestCore;
const seed = C.upgrade(C.initial()); seed.active = 'c-material';
await window.hub.kvSet('quest-journal', seed);
await QuestHud.refresh();
const d0 = new Date(); d0.setHours(18, 0, 0, 0); while (d0.getDay() !== 4 || d0.getTime() < Date.now() - 6 * 3600e3) d0.setDate(d0.getDate() + 1); // the next Thursday, 18:00
const THU = d0.getTime(), H1 = 3600e3;
const panelAt = async (t) => { WP.setClock(() => t); QuestHud.close(); await QuestHud.open(); await until(() => document.querySelector('.qh-panel .qh-foot'), 'tracker panel'); await wait(80); return Boolean(hudBtn()); };
step('Monday: no weekend button in the ✦ tracker', !(await panelAt(THU - 3 * 24 * H1)));
step('Thursday 16:00: not yet', !(await panelAt(THU - 2 * H1)));
step('Thursday 18:00: "🗓 Plan my weekend" shows in the tracker, with its label', (await panelAt(THU)) && hudBtn().textContent.includes('Plan my weekend'), hudBtn()?.textContent);
step('Sunday: still there', await panelAt(THU + 3 * 24 * H1 - 6 * H1));
await panelAt(THU);
step('the card\'s code is not loaded before the first click', !Lazy.isIn('weekendplan'));

// fixtures: the saved shows (showsync61's shape), the open music project; offline
await Lazy.load('weekendplan');
const fri = W.addDays(W.key(new Date(THU)), 1), at = (day, h) => W.parse(day).getTime() + h * H1;
WeekendPlan._test.shows = [
  { key: 'wp-cigale', title: 'Friday Check', start: at(fri, 20), venue: { name: 'La Cigale', address: '120 Bd de Rochechouart, 75018 Paris', lat: 48.8823, lon: 2.3404 }, lineup: ['Check Band'], tickets: [{ platform: 'shotgun', url: 'https://shotgun.live/en/events/check' }], platforms: ['shotgun'], cancelled: false },
  { key: 'wp-rex', title: 'Rex late', start: at(fri, 23.5), venue: { name: 'Rex Club', address: '5 Bd Poissonnière, 75002 Paris', lat: 48.8706, lon: 2.3474 }, lineup: ['Late Act'], tickets: [{ platform: 'dice', url: 'https://dice.fm/event/rex' }], platforms: ['dice'], cancelled: false },
];
WeekendPlan._test.projects = [{ id: 'p-ep', name: 'Night bus EP', status: 'active', updated: THU - 2 * 24 * H1, notes: 'four tracks' }, { id: 'p-game', name: 'Clink', status: 'active', updated: THU, notes: 'three.js game' }];
WeekendPlan._test.takes = [];
const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });

// ---------- 2. click the button: the card ----------
hudBtn().click();
await until(() => card() && card().querySelectorAll('.wp-slot').length === 4, 'the weekend card with four slots');
const st = () => WeekendPlan.state(), opt = (id) => st().slots.find((x) => x.id === id)?.option;
step('a card beside the rail with four slots: night out, afternoon outside, nearby, studio', vis(card()) && card().getBoundingClientRect().left >= document.getElementById('rail').getBoundingClientRect().right - 1, [...card().querySelectorAll('.wp-slot')].map((r) => r.dataset.slot));
step('offline: it says it uses the saved shows and asks for no forecast', /Offline: using the shows Hearth saved/.test(card().textContent) && /No forecast/.test(card().textContent), card().querySelector('.wp-status')?.textContent);
step('Friday night: the saved show', opt('night')?.kind === 'show' && opt('night').day === fri && opt('night').time === '20:00' && slot('night').textContent.includes('Check Band'), opt('night'));
step('an afternoon at the park (Saturday with no forecast), 15:00', opt('outside')?.kind === 'park' && W.weekday(opt('outside').day) === 'Sat' && opt('outside').time === '15:00', opt('outside'));
step('a place near the park right after (17:00)', opt('nearby')?.kind === 'place' && opt('nearby').day === opt('outside').day && opt('nearby').time === '17:00' && /from Buttes-Chaumont/.test(opt('nearby').why), opt('nearby'));
step('a studio session on the open music project (not the game), on Sunday', opt('studio')?.kind === 'studio' && /Night bus EP/.test(opt('studio').title) && W.weekday(opt('studio').day) === 'Sun', opt('studio'));
step('every slot shows its day and time in words', [...card().querySelectorAll('.wp-slot .wp-when')].every((n) => /^(Fri|Sat|Sun) \d+ · \d\d:\d\d · /.test(n.textContent)), [...card().querySelectorAll('.wp-when')].map((n) => n.textContent));
await smoke({ shot: `${shotDir}/weekendplan-card.png` });

// ---------- 3. Swap and Keep by clicking ----------
const before = opt('night').id;
slot('night').querySelector('.wp-swap').click(); await wait(60);
step('Swap: the night\'s next best option', opt('night').id !== before && slot('night').textContent.includes('Late Act'), opt('night').title);
slot('night').querySelector('.wp-swap').click(); await wait(60);
step('Swap again comes back round', opt('night').id === before);
step('Swap is off only where a slot has a single option', [...card().querySelectorAll('.wp-slot')].every((r) => r.querySelector('.wp-swap').disabled === (st().slots.find((x) => x.id === r.dataset.slot).count < 2)));
slot('nearby').querySelector('.wp-keep').click(); await wait(60);
step('Keep off: the nearby place is left out (shown crossed), Accept counts 3', slot('nearby').classList.contains('off') && slot('nearby').querySelector('.wp-keep').getAttribute('aria-pressed') === 'false' && /Accept plan \(3\)/.test(card().querySelector('.wp-accept').textContent), card().querySelector('.wp-accept').textContent);

// ---------- 4. Accept plan ----------
const keptPlace = opt('nearby').place;
card().querySelector('.wp-accept').click();
const week = WP.weekend(THU).week;
await until(async () => ((await disk()).weekly?.plans?.find((p) => p.week === week)?.items || []).length === 3, 'three weekend quests on disk');
let d = await disk();
const items = d.weekly.plans.find((p) => p.week === week).items;
step('Accept plan: the three kept slots are quests on their days, with times', items.map((x) => `${W.weekday(x.day)} ${x.time} ${x.kind}`).join(' | ') === `Fri 20:00 show | Sat 15:00 park | Sun 14:00 studio`, items.map((x) => `${W.weekday(x.day)} ${x.time} ${x.kind}`));
step('real quests: the show quest, the park quest, a music session for the project', d.campaigns.some((c) => c.id === 'c-show-wp-cigale' && !c.paused) && d.campaigns.some((c) => c.id === 'c-pq-park') && d.campaigns.some((c) => c.path === 'music' && c.projectId === 'p-ep'));
step('the left-out place was not planned', !items.some((x) => x.kind === 'place') && !d.campaigns.some((c) => c.parisPlace === keptPlace));
step('the main quest you track is unchanged', d.active === 'c-material', d.active);
step('Codex\'s journal rules still pass', (() => { try { C.validate(d); W.checkWeekly(d.weekly); return true; } catch (e) { return e.message; } })() === true);
await until(() => card()?.querySelector('.wp-done'), 'planned note');
step('the card says it\'s planned and marks the slots ✓ planned', card().querySelector('.wp-done').textContent.includes('3 on your week plan') && slot('night').textContent.includes('✓ planned'));
const n = d.campaigns.length;
card().querySelector('.wp-accept').click(); await wait(600); d = await disk();
step('Accept again: nothing duplicated', d.campaigns.length === n && d.weekly.plans.find((p) => p.week === week).items.length === 3, { campaigns: d.campaigns.length - n });
await smoke({ shot: `${shotDir}/weekendplan-accepted.png` });

// ---------- 5. See my week; chat (secondary) ----------
card().querySelector('.wp-week').click();
await until(() => document.querySelector('.wq-panel:not(.wp-panel) .wq-days'), 'the week card');
step('"See my week" opens the week card, the weekend card closes', !card());
WeekQuest.close();
activate(agent); await wait(200);
await Commands.tryRun('/quest weekend', agent);
await until(() => (document.querySelector('.surface.active')?.textContent || '').includes('Your weekend'), 'the plan in the chat');
step('/quest weekend: the plan in the chat too', /Fri \d\d:\d\d · Go see Check Band/.test(document.querySelector('.surface.active').textContent));
WeekendPlan.close();

// restore
if (onLine) delete navigator.onLine;
WP.setClock(null);
await wait(300);
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
