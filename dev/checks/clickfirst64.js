// (round 64, clickfirst64) Every round 61–63 feature reached by clicking, on a fresh profile, without a single command.
// The owner: "I really don't use commands at all." Commands.run / Commands.tryRun are counted the whole time and must
// stay at 0; nothing is typed in a chat box. Each step clicks what the owner sees (the rail, the ✦ chip, its panel,
// its "⋯ More", the Studio's "My week ▾", the week card, the Sound desk's row, the Lab's ⋯, ▶ Play's right-click, the
// game window's F chip) and checks the feature opened, with a picture of it in the save folder (clickfirst64-*.png):
//   quests   fresh: no journal, no chip → the rail's Sidequest Studio (its "My week ▾") → the ✦ chip → the panel:
//            "No plan for this week yet" + Plan your week, Week in review ›, Make a walk, Rewards' All rewards ›, ⋯ More
//            → the week card (proposals, Accept all, the nudge switch) → the week in review → a walk (its dialog) →
//            Studio › Rewards → More › Shows this week… (Load this week's shows: the test fixtures) → Shows I went to…
//            → the week plan's show chip → the panel's Get ready (the prep card) → the park quest's 🌳 Park mode
//   sound    the Sound desk (Creative Playground › Serum 2 & Vital, the fake laptop host): Park mode, Sound bank, Arrange
//            loops, the ✦ Preset window, the Audio output picker, all as words on screen
//   play     the Lab's ⋯ › Capture & playtest › ✎ Playtest log / ● Record the hitch map / ▦ Hitch map; ▶ Play's right-click
//            (the same three); ▶ Play → F → the chip's "✎ Note (F8)" clicked → a note; "■ Stop hitch map" clicked → off
//   node dev/smoke.js --fake-vst --fake-vst-no-ua --check-timeout 600000 --script dev/checks/clickfirst64.js
//   (▶ Play needs a local three.js: HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package, as the other game checks)
const tile = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...tile, set(v) { if (String(v).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } tile.set.call(this, v); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = performance.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (performance.now() > end) return null; await wait(60); } };
const out = { steps: [], shots: [], table: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 240) : JSON.stringify(info).slice(0, 240)}`}`); if (!ok) fails.push(name); return Boolean(ok); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, String(err?.stack || err).slice(0, 400)); } };
const SAVES = window.SMOKE_SAVES || window.SMOKE_TMP;
const shot = async (n, feature, where) => { const f = `${SAVES}/clickfirst64-${n}.png`; await wait(250); await smoke({ shot: f }); out.shots.push(f); if (feature) out.table.push({ feature, where, shot: `clickfirst64-${n}.png` }); };
const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const words = (b) => (b.querySelector?.('.qj-action-text')?.textContent ?? b.textContent ?? '').trim();
const find = (re, root = document, sel = 'button') => [...root.querySelectorAll(sel)].filter(vis).find((b) => re.test(words(b)));
const click = async (re, root = document, sel = 'button', ms = 8000) => { const b = await until(() => find(re, root, sel), ms); if (!b) throw Error(`no button ${re}`); b.click(); await wait(200); return b; };
const menuRow = async (re) => { const b = await until(() => [...document.querySelectorAll('#menu > button')].find((x) => re.test(x.textContent)), 4000); if (!b) throw Error(`no menu row ${re} in ${[...document.querySelectorAll('#menu > button')].map((x) => x.textContent).join(' | ')}`); b.click(); await wait(250); return b; };
const dlg = () => [...document.querySelectorAll('dialog[open]')].at(-1) || null;
const closeDialogs = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());
const chip = () => document.querySelector('#rail .qh-chip');
const panel = () => document.querySelector('.qh-panel:not(.wq-panel)');
const openPanel = async () => { if (!panel()) chip().click(); return until(() => panel()?.querySelector('.qh-foot') && panel()); };

// nothing typed: every command run is counted
const ran = [];
for (const k of ['run', 'tryRun']) { const f = Commands[k]; if (typeof f === 'function') Commands[k] = function (...a) { ran.push(String(a[0]).slice(0, 60)); return f.apply(this, a); }; }

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 30000);
await until(() => Lazy.isIn('questhud'), 20000);
await wait(300);
const T = window.hub.shows?.test ? await window.hub.shows.test({ dev: window.SMOKE_DEV }) : null; // the shows' fixtures (no network)

// ---------- quests ----------
await safe('quests: fresh', async () => {
  step('fresh profile: no journal, no ✦ chip yet', (await hub.kvGet('quest-journal', null, { status: true }))?.state === 'missing' && !vis(chip()));
  const rail = document.querySelector('#rail .agent-btn[data-id="tool:quests"]');
  step('Sidequest Studio is in the rail', vis(rail), rail?.title);
  rail.click();
  await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 20000);
  const mw = await until(() => document.querySelector('.cf-studio-week'));
  step('the Studio\'s top bar: "My week ▾" in words', vis(mw) && /My week/.test(mw.textContent), mw?.textContent);
  await shot('studio', 'Sidequest Studio › My week ▾ (the quest features in one menu)', 'Rail › Sidequest Studio › My week ▾');
  mw.click(); await wait(250);
  const rows = [...document.querySelectorAll('#menu > button')].map((b) => b.textContent);
  step('My week ▾ lists every quest feature', ['Quest tracker', 'Plan my week', 'Week in review', 'Make a walk', 'My rewards', 'Shows this week', 'Shows I went to', 'Park mode', 'Arrange park loops'].every((w) => rows.some((r) => r.includes(w))), rows);
  await shot('studio-menu');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); hideMenu?.();
  step('the ✦ chip appears once the Studio has a journal', await until(() => vis(chip())));
});

await safe('quests: panel', async () => {
  const p = await openPanel();
  step('click the ✦ chip: the tracker panel', vis(p));
  const t = p.innerText;
  step('first time: "No plan yet" says what to click (Plan your week)', /No plan yet/.test(t) && vis(find(/^Plan your week$/, p)), t.split('\n').slice(0, 30).join(' | '));
  step('Week in review ›, Make a walk and All rewards › in words', vis(find(/^Week in review ›$/, p)) && vis(find(/^Make a walk$/, p)) && vis(find(/^All rewards ›$/, p)));
  step('the panel\'s ⋯ says "More"', vis(find(/⋯ More/, p)));
  await shot('panel', 'The ✦ tracker panel: This week, the next step, rewards', 'Click the ✦ chip in the rail (or Ctrl/⌘+Shift+O)');
  await click(/⋯ More/, p);
  const rows = [...document.querySelectorAll('#menu > button')].map((b) => b.textContent);
  step('More lists the quest features first', /Plan my week/.test(rows[0] || '') && ['Week in review', 'Make a walk', 'My rewards', 'Shows this week', 'Shows I went to', 'Park mode', 'Arrange park loops', 'Open Sidequest Studio', 'Near you'].every((w) => rows.some((r) => r.includes(w))), rows);
  await shot('more', 'Every quest feature in words', '✦ panel › ⋯ More');
  hideMenu();
});

await safe('quests: week plan', async () => {
  await openPanel();
  await click(/^Plan your week$/, panel());
  const card = await until(() => typeof WeekQuest !== 'undefined' && WeekQuest.isOpen() && WeekQuest.state().mode === 'week' && document.querySelector('.wq-panel'), 15000);
  step('Plan your week → the week card', card);
  await until(() => WeekQuest.state().props.length, 12000);
  step('… with proposals and the nudge switch', WeekQuest.state().props.length >= 1 && vis(card.querySelector('.wq-nudge')), WeekQuest.state().props.map((x) => x.title));
  await shot('week', 'Plan my week (3–5 quests on days; the nudge switch)', '✦ panel › Plan your week');
  await click(/^Accept all$|^Accept$/, card);
  await until(() => (QuestHud.journal().S?.weekly?.plans || []).some((x) => x.items.length), 8000);
  step('Accept → planned in the journal', (QuestHud.journal().S?.weekly?.plans || []).some((x) => x.items.length));
  await click(/^Done$/, card);
  const p = await openPanel();
  step('the panel then says how the week goes, with See the plan', /planned done/.test(p.innerText) && vis(find(/^See the plan$/, p)), p.querySelector('.cf-week')?.innerText);
});

await safe('quests: review', async () => {
  const p = await openPanel();
  await click(/^Week in review ›$/, p);
  const card = await until(() => WeekQuest.isOpen() && WeekQuest.state().mode === 'review' && document.querySelector('.wq-panel'), 10000);
  step('Week in review › → the review (stats, a reflection line, Save to journal)', card && vis(find(/Save to journal|Save again/, card)));
  await shot('review', 'Week in review', '✦ panel › Week in review ›');
  card.querySelector('[aria-label="Close"]').click(); await wait(200);
});

await safe('quests: walk', async () => {
  const p = await openPanel();
  await click(/^Make a walk$/, p);
  const d = await until(() => dlg()?.querySelector('.qw-stops') && dlg(), 15000);
  step('Make a walk → the walk (stops, Open walking route, Save as a walk quest)', d && vis(find(/^Open walking route$/, d)) && vis(find(/^Save as a walk quest$/, d)), d?.querySelector('.qw-stops')?.innerText?.split('\n').slice(0, 3));
  await shot('walk', 'A walk (3–5 unvisited places, Métro to Métro)', '✦ panel › Make a walk');
  closeDialogs();
});

await safe('quests: rewards', async () => {
  const p = await openPanel();
  await click(/^All rewards ›$/, p);
  const ok = await until(() => QuestJournal.page === 'rewards' && document.querySelector('.rw-shelf'), 10000);
  step('All rewards › → Studio › Rewards (next reward in XP, kind starters, the jar)', ok);
  await shot('rewards', 'Rewards (XP to the next one, starters, the jar)', '✦ panel › Rewards › All rewards ›');
});

await safe('quests: shows', async () => {
  step('(the shows come from the test fixtures, no network)', T?.ok, T);
  let p = await openPanel();
  await click(/⋯ More/, p); await menuRow(/Shows this week/);
  const d = await until(() => dlg()?.querySelector('.ss-list') && dlg(), 10000);
  step('More › Shows this week… → the list', d);
  const load = find(/Load this week/, d); if (load) { load.click(); await until(() => dlg()?.querySelector('.ss-row'), 20000); }
  step('… Load this week\'s shows → this week\'s shows', await until(() => dlg()?.querySelector('.ss-row'), 5000), dlg()?.innerText?.slice(0, 160));
  await shot('shows', 'Shows this week (Shotgun + DICE)', '✦ panel › ⋯ More › Shows this week…');
  closeDialogs();
  p = await openPanel();
  await click(/⋯ More/, p); await menuRow(/Shows I went to/);
  step('More › Shows I went to… → the log', await until(() => /Shows I went to|nights/i.test(dlg()?.innerText || ''), 8000), dlg()?.innerText?.slice(0, 120));
  await shot('showlog', 'Shows I went to', '✦ panel › ⋯ More › Shows I went to…');
  closeDialogs();
  // a show on the week plan: the week card's show chip → the ✦ panel's show card → Get ready
  p = await openPanel();
  await click(/^See the plan$|^Plan your week$/, p);
  const card = await until(() => WeekQuest.isOpen() && document.querySelector('.wq-panel'), 8000);
  const acc = find(/^Accept all$/, card) || find(/^Accept$/, card); if (acc) { acc.click(); await wait(600); }
  const showChip = await until(() => [...document.querySelectorAll('.wq-panel .wq-chip, .wq-panel [class*="wq-c"]')].find((n) => /Go see|show/i.test(n.getAttribute('aria-label') || n.textContent) && n.tagName === 'BUTTON'), 5000);
  step('the plan has a show (from this week\'s list)', showChip, [...document.querySelectorAll('.wq-panel .wq-day')].map((n) => n.getAttribute('aria-label')));
  if (showChip) {
    showChip.click(); await wait(300);
    await click(/^Done$/, card);
    p = await openPanel();
    const ready = await until(() => find(/^Get ready$/, panel()), 6000);
    step('the show quest\'s card: Get ready / How was it? in words', ready && vis(find(/^How was it\?$/, panel())), panel()?.querySelector('.qh-card')?.innerText?.slice(0, 120));
    await shot('showcard', 'Show night: Get ready / How was it?', '✦ panel › the show quest\'s card');
    ready.click();
    step('Get ready → the prep card (calendar, Métro, lineup, reminder)', await until(() => dlg()?.classList.contains('sp-dialog') && dlg(), 10000));
    await shot('prep', 'Get ready (calendar, Métro, lineup, remind me)', '✦ panel › show quest › Get ready');
    closeDialogs();
  } else WeekQuest.close();
});

// ---------- the Sound desk ----------
const runtime = await hub.vst?.status?.().catch(() => null);
const fakeHost = runtime?.ok && /fake/.test(runtime.version || '');
await safe('sound desk', async () => {
  if (!fakeHost) { step('(Sound desk part skipped: the fake audio host isn\'t here: smoke --fake-vst)', true, runtime?.error || runtime?.version); return; }
  // the owner's plugin folder (what "Plugin folder" picks)
  const dir = `${window.SMOKE_TMP}/clickfirst64`;
  await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
  await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; await hub.kvSet('creative-workbenches', project);
  document.querySelector('#rail .agent-btn[data-id="tool:creative"]')?.click() ?? activate('tool:creative');
  await until(() => vis(find(/^Serum 2 & Vital$/)), 15000);
  await click(/^Serum 2 & Vital$/);
  await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000);
  await click(/^Vital$/, document, '.wb-instrument-card');
  await until(() => /^LIVE/.test(document.querySelector('.wb-live-stats')?.textContent || ''), 20000);
  const row = document.querySelector('.wb-park-toggle')?.parentElement;
  step('the desk\'s row: 🌳 Park mode, Sound bank, Arrange loops (words, the same row)', row && ['🌳 Park mode', 'Sound bank', 'Arrange loops'].every((w) => [...row.querySelectorAll('button')].some((b) => b.textContent.trim() === w)), [...(row?.querySelectorAll('button') || [])].map((b) => b.textContent));
  step('the live device picker and the ✦ Preset window are on screen', vis(document.querySelector('select[aria-label="Audio output"]')) && vis(document.querySelector('.ph-win')), document.querySelector('select[aria-label="Audio output"]')?.selectedOptions?.[0]?.textContent);
  await shot('desk', 'Sound desk: Park mode · Sound bank · Arrange loops · ✦ Preset · Audio output', 'Rail › Creative Playground › Serum 2 & Vital');
  await click(/^Sound bank$/, row);
  step('Sound bank → the picker', await until(() => typeof SoundBank !== 'undefined' && vis(document.querySelector('.sb-win')), 8000));
  await shot('soundbank', 'Sound bank (every preset, hover to listen)', 'Sound desk › Sound bank');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); SoundBank.close?.(); await wait(200);
  await click(/^Arrange loops$/, row);
  step('Arrange loops → the Arrange panel', await until(() => vis(document.querySelector('.ls-view')), 8000));
  await shot('arrange', 'Arrange park loops into a song', 'Sound desk › Arrange loops');
  LoopSong.close?.(); await wait(200);
  // the park quest's own button (the week plan proposed the park; its chip → the ✦ card → 🌳 Park mode)
  const S = QuestHud.journal().S, park = S?.campaigns?.find((c) => c.id === 'c-pq-park');
  if (park) {
    const p = await openPanel();
    await click(/^See the plan$/, p);
    const card = await until(() => document.querySelector('.wq-panel'), 6000);
    const pc = [...card.querySelectorAll('button')].find((n) => /park/i.test(n.getAttribute('aria-label') || '') && n.closest('.wq-day'));
    if (pc) { pc.click(); await wait(300); }
    await click(/^Done$/, card);
    await openPanel();
    const pm = await until(() => find(/^🌳 Park mode$/, panel()), 5000);
    step('the park quest\'s card: 🌳 Park mode in words', pm, panel()?.querySelector('.qh-card')?.innerText?.slice(0, 100));
    await shot('parkcard', 'The park quest: 🌳 Park mode / Arrange loops', '✦ panel › the park quest\'s card');
    if (pm) { pm.click(); step('… Park mode turns on (the Sound desk, set for the park)', await until(() => ParkJam.state()?.on, 20000)); await ParkJam.off().catch(() => {}); }
  } else step('(no park quest proposed this week: its card button not shown)', true);
});

// ---------- ▶ Play: playtest notes, the hitch map ----------
await safe('play', async () => {
  QuestHud.close(); closeDialogs();
  document.querySelector('#rail .agent-btn[data-id="tool:three"]')?.click() ?? activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && document.querySelector('[data-feature="Lab more"]'), 30000);
  await wait(1500);
  const more = document.querySelector('[data-feature="Lab more"]');
  const pop = async () => { more.click(); return until(() => document.querySelector('.mb-menu.lab-pop'), 4000); };
  const popRow = async (re) => { const b = await until(() => [...document.querySelectorAll('.mb-menu.lab-pop .menu-item')].find((x) => re.test(x.querySelector('b')?.textContent || x.textContent)), 4000); if (!b) throw Error(`no Lab menu row ${re}`); b.click(); await wait(250); };
  await pop();
  step('the Lab toolbar\'s ⋯ has "Capture & playtest"', await until(() => [...document.querySelectorAll('.lab-pop .menu-item b')].some((b) => b.textContent === 'Capture & playtest'), 3000));
  await popRow(/^Capture & playtest$/);
  const sub = [...document.querySelectorAll('.lab-pop .menu-item b')].map((b) => b.textContent);
  step('… › ▶ Playtest: Playtest log · Record the hitch map · Hitch map', [...document.querySelectorAll('.lab-pop .menu-head')].some((h) => h.textContent === '▶ Playtest') && ['✎ Playtest log', '● Record the hitch map', '▦ Hitch map'].every((w) => sub.includes(w)), sub);
  await shot('labmenu', '▶ Playtest: Playtest log · Record the hitch map · Hitch map', 'Lab toolbar ⋯ › Capture & playtest › ▶ Playtest');
  await popRow(/✎ Playtest log/);
  step('✎ Playtest log → the log (says F8 drops a note)', await until(() => document.querySelector('dialog.pn-log[open]') || [...document.querySelectorAll('.toast')].some((t) => /F8/.test(t.textContent)), 10000));
  await shot('playlog', 'Playtest log', 'Lab ⋯ › Capture & playtest › ✎ Playtest log');
  closeDialogs();
  await pop(); await popRow(/^Capture & playtest$/); await popRow(/Record the hitch map/);
  step('● Record the hitch map → on', await until(() => store.get('hitchmap.on', false) === true, 5000));
  await pop(); await popRow(/^Capture & playtest$/); await popRow(/▦ Hitch map/);
  step('▦ Hitch map → the map (first time: says recording is on, play and come back)', await until(() => document.querySelector('dialog.hm-map[open] .hm-empty'), 10000), document.querySelector('dialog.hm-map[open]')?.innerText?.slice(0, 140));
  await shot('hitchmap', 'Hitch map (first time: what to do)', 'Lab ⋯ › Capture & playtest › ▦ Hitch map');
  closeDialogs();
  // ▶ Play's right-click
  const play = document.querySelector('[data-feature="Play"]');
  step('▶ Play\'s tooltip says what its right-click has', /right-click: the playtest log, the hitch map/.test(play?.title || ''), play?.title);
  play.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 120 }));
  const rows = await until(() => { const m = document.getElementById('menu'); const r = m && !m.hidden ? [...m.querySelectorAll(':scope > button')].map((b) => b.textContent) : []; return r.some((x) => /Playtest log/.test(x)) ? r : null; }, 6000);
  step('▶ Play\'s right-click: Playtest log, Record the hitch map, Hitch map', rows && ['Playtest log', 'Record the hitch map', 'Hitch map'].every((w) => rows.some((r) => r.includes(w))), rows);
  await shot('playmenu', '▶ Play right-click: playtest log, hitch map', 'Lab › ▶ Play (right-click)');
  hideMenu();
  // ▶ Play → F → the chip's words, clicked
  play.click();
  const G = window.hub.game, ev = async (code) => (await G.eval(code))?.value;
  const up = await until(() => ev('Boolean(window.__hearthGame && window.__hearthGame.drawn)'), 90000);
  step('▶ Play: the game window', up, [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ') || (await G.state().catch(() => null)));
  if (!up) return;
  await wait(1500);
  await G.key({ key: 'F' });
  const acts = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const a = r?.querySelector(".acts"); if (!a || a.hidden) return ""; return JSON.stringify([...a.querySelectorAll("button")].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) }; })); })()'), 8000);
  const btns = acts ? JSON.parse(acts) : [];
  step('F: the chip shows "✎ Note (F8)" and "■ Stop hitch map" in words', btns.some((b) => /✎ Note \(F8\)/.test(b.t)) && btns.some((b) => /Stop hitch map/.test(b.t)), btns.map((b) => b.t));
  try { const r = await smoke({ pageCdp: '^hearth-game:', cdp: 'Page.captureScreenshot', params: { format: 'png' } }); if (r?.data) { await hub.fs.write(`${SAVES}/clickfirst64-fchip.png`, Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0))); out.shots.push(`${SAVES}/clickfirst64-fchip.png`); out.table.push({ feature: 'F chip: ✎ Note (F8) · ● Record / ■ Stop hitch map', where: '▶ Play › F', shot: 'clickfirst64-fchip.png' }); } } catch { /* the picture is a bonus */ }
  const note = btns.find((b) => /Note/.test(b.t)), hm = btns.find((b) => /hitch map/.test(b.t));
  const before = (await G.notes({ op: 'state' }))?.n || 0;
  const noted = async () => ((await G.notes({ op: 'state' }))?.n || 0) > before;
  await G.click({ x: note.x, y: note.y });
  let ok = await until(noted, 6000);
  if (!ok) { await G.click({ x: note.x, y: note.y }); ok = await until(noted, 8000); } // (a note is skipped while another picture is being taken, like F8: once more)
  step('click "✎ Note (F8)" → a playtest note', ok, await G.notes({ op: 'state' }).catch(() => null));
  await G.click({ x: hm.x, y: hm.y });
  step('click "■ Stop hitch map" → the recording stops (the setting too)', await until(() => store.get('hitchmap.on', false) === false, 8000));
  await Promise.resolve(GameMode.leave()).catch(() => {});
  await until(async () => !(await G.state())?.playing, 15000);
});

step('no command was run the whole time (nothing typed)', ran.length === 0, ran);
step('the chat box is still empty', !(document.querySelector('.composer textarea')?.value || ''));
out.fails = fails;
return JSON.stringify(out, null, 1);
