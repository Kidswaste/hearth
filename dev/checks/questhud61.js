// (round 61, questhud61) ✦ The quest tracker in the rail: hidden with no journal (and QuestCore not even loaded), zero
// timers while idle, the chip shows the active quest, chat commands check off a step without the Studio (the Studio
// then sees it), Studio changes reach the chip, the panel expands and checks off a step through the Studio, the finish
// line opens the proof in the Studio, Take / track / hud on|off, Ctrl/⌘+Shift+O, Ctrl/⌘+K lines, the keys sheet, tiny
// when nothing is active, the chip in the Lab, and the panel never over the chat's column.
//   node dev/smoke.js --script dev/checks/questhud61.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const chip = () => document.querySelector('#rail .qh-chip');
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const panel = () => document.querySelector('.qh-panel');
const agent = H.claudeAgent().id;
const run = (line) => Commands.tryRun(line, agent);

// timers and DOM writes made by the tracker (by the stack: questhud*.js)
const T = { n: 0, what: [] };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
  const orig = window[name]; if (!orig) continue;
  window[name] = function (...a) { const st = new Error().stack || ''; if (/questhud/.test(st)) { T.n++; T.what.push(name); } return orig.apply(this, a); };
}
const idle = async (ms, label) => {
  const t0 = T.n; let muts = 0; const c = chip();
  const mo = new MutationObserver((l) => { muts += l.length; }); if (c) mo.observe(c, { subtree: true, childList: true, attributes: true, characterData: true });
  await wait(ms); mo.disconnect();
  step(`${label}: no timers, no chip writes while idle (${ms} ms)`, T.n === t0 && muts === 0, { timers: T.n - t0, muts });
};

// ---------- 1. no journal: no chip, QuestCore stays unloaded ----------
await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
await wait(300);
step('no journal yet: no chip', !vis(chip()), chip()?.outerHTML?.slice(0, 120));
step('no journal yet: QuestCore not loaded', !Lazy.isIn('questcore') && !Lazy.isIn('questjournal'));
step('the chip sits in the rail, right above Usage', chip()?.parentElement?.id === 'rail' && chip()?.nextElementSibling?.classList.contains('meter-pill'), chip()?.nextElementSibling?.className);
await idle(1500, 'no journal');

// ---------- 2. a journal appears (written by the Studio's rules) → the chip shows its main quest ----------
await Lazy.load('questcore');
const C = QuestCore;
const seed = C.upgrade(C.initial());
await window.hub.kvSet('quest-journal', seed);
await QuestHud.refresh();
const main = seed.campaigns.find((c) => c.id === seed.active);
const q0 = main.quests[0], q1 = main.quests[1];
step('the chip shows the active quest, its next step and progress', vis(chip()) && chip().getAttribute('aria-label').includes(q0.title) && /next: first move/.test(chip().getAttribute('aria-label')) && chip().querySelector('.qh-num').textContent === `1/${main.quests.length}`, chip().getAttribute('aria-label'));
const r = chip().getBoundingClientRect(), rail = document.getElementById('rail').getBoundingClientRect();
step('the chip stays inside the rail (one chip, not a row)', r.left >= rail.left && r.right <= rail.right && r.width <= 44 && r.height <= 44, [r.width, r.height]);
await idle(1500, 'journal shown');

// ---------- 3. chat: /quest, /quest next, /quest done (no Studio open: the tracker saves by the Studio's rules) ----------
activate(agent); await wait(200); // (sweep69) Hearth now starts on the Projects desk (lazyfix66): /quest is typed in a chat, so be in one
const before = document.querySelectorAll('.surface.active .note, .surface.active [class*="note"]').length;
await run('/quest'); await wait(200);
const chatText = () => document.querySelector('.surface.active')?.textContent || '';
step('/quest says the quest and its next step in the chat', chatText().includes(q0.title) && /Next — first move/.test(chatText()), before);
await run('/quest next'); await wait(150);
await run('/quest done'); await wait(200);
const disk = (await window.hub.kvGet('quest-journal')) || {};
step('/quest done checks off the first move in the journal (+5 XP)', Boolean(disk.records?.[q0.id]?.startedAt) && C.xp(disk) === 5, disk.records?.[q0.id]);
step('the chip moves on to the finish line', /next: finish line/.test(chip().getAttribute('aria-label')), chip().getAttribute('aria-label'));
step('/quest track lists names; unknown names answer plainly', /Track one of/.test(String(await Commands.tryRun('/quest track', agent) ?? chatText())) || /Track one of/.test(chatText()));

// ---------- 4. the Studio sees it, and its changes reach the chip ----------
step('the Studio is still not loaded (the chip did it alone)', !Lazy.isIn('questjournal'));
activate('tool:quests');
await until(() => document.querySelector('.qj-hero h2') && QuestJournal.ready(), 'Studio open');
const studioBtn = (t) => [...document.querySelectorAll('.qj button')].find((b) => b.textContent === t);
// (questfix65) with Codex's guided companion (QuestGuide) the hero's primary is always "Continue with helper →"; a started quest
// then shows in the Studio as its small-start XP in the header, so "repainted" = that header matches the saved journal
const xpShown = () => document.querySelector('.qj .qj-xp-line strong')?.textContent === `${C.xp(QuestJournal.snapshot()).toLocaleString()} XP`;
// (sweep69) Codex's Life space labels a started quest's hero button "Continue quest →" with or without the guide
// ("Continue with helper →" is gone); the header XP still has to match the saved journal
const continued = () => Boolean(studioBtn('Continue quest →') || studioBtn('Continue with helper →')) && (!window.QuestGuide?.open || (xpShown() && C.xp(QuestJournal.snapshot()) > 0));
step('Studio → shows the first move the chat checked off', continued() && C.record(QuestJournal.snapshot(), q0.id).startedAt, document.querySelector('.qj-hero h2')?.textContent);
studioBtn('Skip for now →').click();
await until(() => chip().getAttribute('aria-label').includes(q1.title), 'chip follows the Studio');
step('Studio → chip: skipping in the Studio moves the chip to the next quest', chip().getAttribute('aria-label').includes(q1.title) && chip().querySelector('.qh-num').textContent === `2/${main.quests.length}`, chip().getAttribute('aria-label'));

// ---------- 5. the panel: expand, check off a step (through the Studio's own save), the finish line ----------
chip().click(); await until(() => panel(), 'panel opens');
step('click expands the panel with the quest, its steps and Open Sidequest Studio', panel().textContent.includes(q1.title) && panel().querySelectorAll('.qh-step').length === 2 && /Open Sidequest Studio/.test(panel().textContent) && chip().getAttribute('aria-expanded') === 'true');
panel().querySelector('.qh-step .qh-check').click();
await until(() => C.record(QuestJournal.snapshot(), q1.id).startedAt, 'start saved via Studio');
await until(() => continued(), 'Studio repainted');
step('chip → Studio: checking the first move saves through the Studio (it repaints)', continued() && panel()?.querySelector('.qh-step.done'));
const disk2 = await window.hub.kvGet('quest-journal');
step('… and it is on disk once (one store)', Boolean(disk2.records?.[q1.id]?.startedAt));
const fin = panel().querySelectorAll('.qh-step .qh-check')[1];
step('the finish line says it needs proof in the Studio', /proof/i.test(fin.getAttribute('aria-label')), fin.getAttribute('aria-label'));
fin.click();
await until(() => document.querySelector('.qj dialog[open]'), 'proof dialog');
step('checking the finish line opens the quest in the Studio (proof + review), the panel closes', Boolean(document.querySelector('.qj dialog[open]')?.textContent.includes(q1.title)) && !panel());
document.querySelector('.qj dialog[open]')?.close();

// ---------- 6. back in a chat: the chip is there, Take a pick, track, the panel over the chats list only ----------
activate(agent); await wait(300);
step('the chip stays in the rail in a chat', vis(chip()));
chip().click(); await until(() => panel(), 'panel in chat');
const take = [...panel().querySelectorAll('.qh-take')][0];
step('today\'s picks are listed with Take', Boolean(take), panel().textContent.slice(0, 300));
await smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/questhud-panel.png` });
// the chat's column: its message box and its messages / notes (the surface's empty margins may sit under the panel)
const box = document.querySelector('.surface.active form.composer textarea, .surface.active .composer textarea')?.getBoundingClientRect();
const pr = panel().getBoundingClientRect();
step('the panel stays left of the chat column (never over the messages or the box)', !box || pr.right <= box.left + 1, { panel: Math.round(pr.right), box: box && Math.round(box.left) });
if (take) {
  const pickTitle = take.closest('.qh-row').querySelector('.qh-row-title').textContent;
  take.click();
  await until(() => chip().getAttribute('aria-label').includes(pickTitle), 'chip follows the taken pick');
  step('Take makes it your quest (in the Studio too) and the chip follows it', QuestCore.allQuests(QuestJournal.snapshot()).some((q) => q.title === pickTitle && QuestCore.available(QuestJournal.snapshot(), q.id)) && chip().getAttribute('aria-label').includes(pickTitle));
  await run(`/quest track ${main.title}`); await wait(250);
  step('/quest track <campaign> follows the campaign again', chip().getAttribute('aria-label').includes(q1.title), chip().getAttribute('aria-label'));
}
QuestHud.close();

// ---------- 7. the shortcut, Ctrl/⌘+K, the keys sheet, the command ----------
const key = (type) => document.dispatchEvent(new KeyboardEvent(type, { key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true, bubbles: true }));
key('keydown'); await wait(80); const opened = Boolean(panel()); key('keydown'); await wait(80);
step('Ctrl/⌘+Shift+O opens and closes the tracker', opened && !panel());
step('Ctrl/⌘+K has the quest lines', ['Quest: show my quest tracker', 'Quest: check off the next step', 'Quest: show or hide the quest chip'].every((l) => AppUI.actions().some((a) => a.label === l)));
step('the keys sheet lists the shortcut', Keys.groups(true).get('Quests')?.some((k) => /Shift\+O/.test(k.keys)));
step('/quest is one command (no duplicate)', Commands.get('quest')?.area === 'Create' && !JSON.stringify(Commands.duplicates?.() || []).includes('"quest"'));
step('the shortcut shows as this computer says it', /O$/.test(WinMac.keyLabel('Ctrl/⌘+Shift+O')) && chip().title.includes(WinMac.keyLabel('Ctrl/⌘+Shift+O')), chip().title);

// ---------- 8. hide by setting; tiny when nothing is active ----------
await run('/quest hud off'); await wait(100);
step('/quest hud off hides the chip', !vis(chip()));
key('keydown'); await wait(80); step('… the shortcut still opens the tracker', Boolean(panel())); QuestHud.close();
await run('/quest hud on'); await wait(100);
step('/quest hud on brings it back', vis(chip()));
await QuestJournal.mutate((s) => { s.campaigns.forEach((c) => { c.paused = true; }); s.sideQuests.forEach((q) => { q.parked = true; }); s.plan = null; }, 'paused for the check');
await until(() => chip().classList.contains('qh-idle'), 'idle chip');
const ri = chip().getBoundingClientRect();
step('nothing active: the chip goes tiny (just ✦)', vis(chip()) && chip().classList.contains('qh-idle') && ri.height <= 32 && chip().querySelector('.qh-num').textContent === '', [ri.height]);
await QuestJournal.mutate((s) => { s.campaigns.find((c) => c.id === s.active).paused = false; }, 'resumed');
await until(() => !chip().classList.contains('qh-idle'), 'chip back');

// ---------- 8b. one /quest: parisquests61's words pass through, and its quests show in the chip ----------
step('one /quest command (the tracker\'s), with the Paris words in its suggestions', Commands.get('quest')?.run && (Commands.get('quest').complete?.('pa') || []).some((x) => x.value === 'paris'));
if (typeof QuestParis !== 'undefined' || Lazy.isIn('questjournal')) {
  const air = QuestParis.personal.find((t) => t.key === 'airpods');
  if (air) {
    await run('/quest add airpods');
    await until(() => chip().getAttribute('aria-label').includes(air.title), 'chip follows the Paris quest');
    step('/quest add airpods (parisquests61) → the chip follows that quest', chip().getAttribute('aria-label').includes(air.title), chip().getAttribute('aria-label'));
    document.querySelector('.qj dialog[open]')?.close();
    const list = String(await Commands.tryRun('/quest list', agent) ?? '');
    step('/quest list still answers with the Paris quests', /AirPods|Paris|•/.test(list + chatText()));
    await run(`/quest track ${main.title}`); await wait(250);
  }
}

// ---------- 9. the Lab: the chip is there and off the preview ----------
const lab = Tools.enabled().find((t) => t.id === 'three');
if (lab) {
  activate('tool:three'); await wait(1500);
  const prev = [...document.querySelectorAll('.surface.active iframe, .surface.active canvas')].map((n) => n.getBoundingClientRect()).filter((b) => b.width > 200 && b.height > 150).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = chip().getBoundingClientRect();
  step('in the Lab: the chip shows, off the preview', vis(chip()) && (!prev || c.right <= prev.left + 1), { chip: Math.round(c.right), preview: prev && Math.round(prev.left) });
  QuestHud.open(); await until(() => panel(), 'panel in the Lab'); await wait(150);
  const pl = panel().getBoundingClientRect();
  // (sweep69) Codex's three-spaces layout has no chats list beside the Lab any more (the preview starts at the rail):
  // when there is no room left of the preview, the open panel may cover its edge but never the picture's middle
  const room = !prev || prev.left >= pl.width;
  step(room ? 'in the Lab: the open panel sits over the chats list, not the preview' : 'in the Lab: the open panel keeps off the middle of the preview', !prev || (room ? pl.right <= prev.left + 1 : pl.right <= prev.left + prev.width / 2), { panel: Math.round(pl.right), preview: prev && [Math.round(prev.left), Math.round(prev.width)] });
  await smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/questhud-lab.png` });
  QuestHud.close();
  activate(agent); await wait(200);
}

// ---------- 10. idle again: still nothing ----------
await idle(2000, 'after use');
await QuestJournal.flush();
out.timers = T.what.slice(0, 20);
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
