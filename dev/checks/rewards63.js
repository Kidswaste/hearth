// (round 63, rewards63) Real rewards for real quests in the app: the streak bonus is granted once a week when a quest
// change shows it's due; no timers while idle; /reward add (in XP) lands in Codex's journal in sparks; the ✦ tracker
// panel says "N XP to your next reward: …", then Ready + Claim… with a confirm (Not now / Claim it), saved once;
// /reward redeem refuses what you can't afford (nothing written) and asks before a claim; a jar reward waits for
// "I moved it"; /reward history lists every claim; Studio › Rewards shows the shelf (next reward, jar, starters, every
// claim) and a starter added there reaches the journal; one /reward command; the journal stays valid.
//   node dev/smoke.js --script dev/checks/rewards63.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const agent = H.claudeAgent().id;
const run = (line) => Commands.tryRun(line, agent);
activate(agent); // (sweep69) Hearth now starts on the Projects desk (lazyfix66): the chat commands' notes land in the chat, so be in it
const panel = () => document.querySelector('.qh-panel');
const disk = async () => (await window.hub.kvGet('quest-journal')) || {};
const chatText = () => document.querySelector('.surface.active')?.textContent || '';
const noteBtn = (label) => [...document.querySelectorAll('.surface.active .note-acts button')].reverse().find((b) => b.textContent.trim().startsWith(label));
const panelBtn = (label) => [...(panel()?.querySelectorAll('button') || [])].find((b) => b.textContent.trim().startsWith(label));
const shotDir = window.SMOKE_TMP || window.SMOKE_SAVES;

// timers made by the rewards code (by the stack: rewards*.js)
const T = { n: 0 };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
  const orig = window[name]; if (!orig) continue;
  window[name] = function (...a) { if (/rewards(-core)?\.js/.test(new Error().stack || '')) T.n++; return orig.apply(this, a); };
}

// ---------- 1. a journal with three weeks in a row out in the world (150 XP) ----------
await until(() => Lazy.isIn('questhud') && typeof RewardShelf !== 'undefined', 'the tracker + rewards load after the first screen');
step('rewards ride in the tracker\'s group and QuestCore stays unloaded without a journal', !Lazy.isIn('questcore'));
await Lazy.load('questcore');
const C = QuestCore, W = WeekQuestCore, R = RewardsCore;
const seed = C.upgrade(C.initial()); seed.rewards = []; seed.rewardGoal = null;
const life = C.addCampaign(seed, { title: 'Out in Paris', why: 'check', path: 'life', milestones: ['week 1', 'week 2', 'week 3', 'week 4', 'week 5'] });
life.quests.forEach((q) => { q.xp = 50; });
const mon = W.monday(W.key(new Date()));
const at = (k) => new Date(W.parse(W.addDays(mon, -7 * k)).getTime() + 10 * 3600e3).toISOString();
delete seed.studio; [2, 1, 0].forEach((k, i) => C.complete(seed, life.quests[i].id, {}, at(k))); seed.studio = { v: 1 };
seed.active = 'c-material';
await window.hub.kvSet('quest-journal', C.validate(seed));
await QuestHud.refresh();
document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: C.clone(seed), source: 'check' } }));
await until(async () => (await disk()).rewardBonus?.weeks?.length === 1, 'streak bonus on disk');
let d = await disk();
step('a 3-week streak: +2 sparks (10 XP) streak bonus, saved in the journal', d.rewardBonus.weeks[0].sparks === 2 && d.rewardBonus.weeks[0].streak === 3 && C.balance(d) === 32, d.rewardBonus);
document.dispatchEvent(new CustomEvent('hearth:quests', { detail: { state: C.clone(d), source: 'check' } }));
await wait(700);
step('only once a week (another quest change grants nothing more)', (await disk()).rewardBonus.weeks.length === 1);
const t0 = T.n; // (the bonus's toast had its own timer: that's an action, not idle)
await wait(1500);
step('no timers from the rewards code while idle', T.n === t0, T.n - t0);

// ---------- 2. /reward add, in XP ----------
await run('/reward add new record at Superfly 300');
await until(async () => (await disk()).rewards.some((r) => /Superfly/.test(r.name)), 'superfly on disk');
await run('/reward add a long breakfast at Enfants Rouges 200xp');
await until(async () => (await disk()).rewards.length === 2, 'breakfast on disk');
d = await disk();
step('/reward add <name> <xp>: saved in Codex\'s reward bay in sparks (300 XP = 60, 200 XP = 40)', d.rewards.find((r) => /Superfly/.test(r.name)).cost === 60 && d.rewards.find((r) => /breakfast/.test(r.name)).cost === 40);
step('the chat answers with how much XP to go', /40 XP to your next reward: a long breakfast/.test(chatText()), chatText().slice(-200));

// ---------- 3. the ✦ tracker panel: progress, then Ready + Claim… with a confirm ----------
QuestHud.open();
await until(() => panel()?.querySelector('.rw-row'), 'panel reward row');
step('the tracker panel: "40 XP to your next reward: a long breakfast…"', /40 XP to your next reward: a long breakfast at Enfants Rouges/.test(panel().textContent), panel().querySelector('.rw-row')?.textContent);
await QuestHud.write((s) => { const st = s.studio; delete s.studio; C.complete(s, life.quests[3].id); s.studio = st; }, 'check');
await until(() => panelBtn('Claim…'), 'Claim button');
step('after a quest (+50 XP): Ready, with a Claim… button', /Ready: a long breakfast/.test(panel().textContent));
await smoke({ shot: `${shotDir}/rewards-tracker.png` });
panelBtn('Claim…').click();
await until(() => panel().querySelector('.rw-confirm'), 'confirm');
step('Claim… asks first (nothing claimed yet)', /Claim “a long breakfast at Enfants Rouges”\?/.test(panel().textContent) && (await disk()).redemptions.length === 0);
panelBtn('Not now').click();
await until(() => !panel().querySelector('.rw-confirm') && panelBtn('Claim…'), 'confirm closed');
step('Not now: back to the row, still nothing claimed', (await disk()).redemptions.length === 0);
panelBtn('Claim…').click(); await until(() => panelBtn('Claim it'), 'confirm again');
panelBtn('Claim it').click();
await until(async () => (await disk()).redemptions.length === 1, 'claimed on disk');
d = await disk();
step('Claim it: one claim saved, sparks spent, XP and level untouched', d.redemptions[0].name === 'a long breakfast at Enfants Rouges' && C.balance(d) === 2 && C.xp(d) === 200, { bal: C.balance(d), xp: C.xp(d) });
await until(() => /XP to your next reward: new record at Superfly/.test(panel().textContent), 'next reward after claim');
step('the panel moves on to the next reward', /XP to your next reward: new record at Superfly/.test(panel().textContent));
QuestHud.close();

// ---------- 4. /reward redeem: can't go negative; asks before claiming; a jar reward ----------
const before = JSON.stringify(await disk());
await run('/reward redeem superfly');
await wait(400);
step('/reward redeem with too little: says the XP to go, writes nothing', /XP to go|XP to your next reward/.test(chatText().slice(-300)) && JSON.stringify(await disk()) === before, chatText().slice(-160));
await QuestHud.write((s) => { const st = s.studio; delete s.studio; C.complete(s, life.quests[4].id); s.studio = st; }, 'check');
await run('/reward add concert ticket fund +10€ 50');
await until(async () => (await disk()).rewards.some((r) => r.jar === 10), 'jar reward on disk');
await run('/reward redeem concert');
await until(() => noteBtn('Yes, claim it'), 'chat confirm');
step('/reward redeem asks first in the chat (nothing claimed yet)', (await disk()).redemptions.length === 1);
noteBtn('Yes, claim it').click();
await until(async () => (await disk()).redemptions.length === 2, 'jar reward claimed');
QuestHud.open();
await until(() => panelBtn('I moved it'), 'jar row');
step('a claimed jar reward: "Move €10 into your jar yourself" in the tracker', /Move €10 into your jar yourself/.test(panel().textContent));
panelBtn('I moved it').click();
await until(async () => R.jar(await disk()).total === 10, 'jar noted');
step('I moved it: €10 noted in the jar (Hearth only keeps the note)', R.jar(await disk()).pending.length === 0);
QuestHud.close();
await run('/reward jar -5 vinyl sleeve');
await until(async () => R.jar(await disk()).total === 5, 'jar minus');
await run('/reward jar -50');
await wait(400);
step('/reward jar -N: taken out, never below €0', R.jar(await disk()).total === 5);

// ---------- 5. history, the summary ----------
await run('/reward history');
await wait(300);
step('/reward history: every claim, newest first', /concert ticket fund[\s\S]*a long breakfast/.test(chatText().slice(-600)), chatText().slice(-300));
await run('/reward');
await wait(300);
step('/reward: XP to spend, the next reward, the jar', /XP to spend on rewards/.test(chatText().slice(-500)) && /Savings jar: €5/.test(chatText().slice(-500)));

// ---------- 6. Sidequest Studio › Rewards: the shelf ----------
activate('tool:quests');
await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 'Studio open');
QuestJournal.navigate('rewards');
await until(() => document.querySelector('.rw-shelf'), 'shelf');
const shelf = () => document.querySelector('.rw-shelf');
step('Studio › Rewards: the real-rewards shelf with the next reward in XP', /XP to your next reward: new record at Superfly/.test(shelf().textContent), shelf().querySelector('.rw-next')?.textContent);
step('…the savings jar and every claim', /€5 in the jar/.test(shelf().textContent) && /Every claim \(2\)/.test(shelf().textContent));
step('…the streak bonus in the wallet line', /streak bonuses \+10 XP/.test(shelf().textContent));
const serum = [...shelf().querySelectorAll('button')].find((b) => /Serum preset pack/.test(b.textContent));
step('kind starters to add (Serum preset pack, Le Champo…)', Boolean(serum));
serum?.click();
await until(async () => (await disk()).rewards.some((r) => r.id === 'r-rw63-serum-presets'), 'starter on disk');
await until(() => ![...(shelf()?.querySelectorAll('button') || [])].some((b) => /Serum preset pack/.test(b.textContent)), 'starter gone from ideas');
step('a starter added in the Studio: saved, and gone from the ideas', (await disk()).rewards.find((r) => r.id === 'r-rw63-serum-presets').cost === 80);
await smoke({ shot: `${shotDir}/rewards-studio.png` });
await run('/reward add a film at the Grand Rex 100');
await until(() => [...document.querySelectorAll('.qj-reward h3')].some((h) => /Grand Rex/.test(h.textContent)), 'Studio repaint');
step('with the Studio open, /reward add goes through the Studio (it repaints at once)', QuestJournal.snapshot().rewards.some((r) => /Grand Rex/.test(r.name)));

// ---------- 7. one command, valid journal ----------
step('one /reward command (alias /rewards), no duplicates', Commands.get('reward')?.name === 'reward' && !(Commands.duplicates?.() || []).some((x) => /reward/.test(JSON.stringify(x))));
d = await disk();
step('the journal is valid for Codex\'s rules, the jar for its own', (() => { try { C.validate(d); R.checkJar(d.rewardJar); return true; } catch (e) { return e.message; } })() === true);
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
