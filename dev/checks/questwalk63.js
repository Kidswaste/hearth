// (round 63, questwalk63) Quest walks in the app: /quest walk makes a 3–5 stop walk of unvisited places (Métro to
// Métro, inside 2 h), draws it on the Paris map (a dotted line + numbered stops), answers in the chat with the steps and
// "Open walking route" (a Google Maps walking link with waypoints, recorded here, never opened); /quest walk save makes
// a walk campaign that passes Codex's rules and the ✦ tracker follows step by step; the guide dialog's "Make a walk"
// (beside its first button, no new row) shows the walk dialog and "3 h instead"; /quest week proposes a walk on a free
// afternoon and accepting it plans the walk quest. Offline map tiles, nothing opened, no AI, no timers.
//   node dev/smoke.js --script dev/checks/questwalk63.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const agent = H.claudeAgent().id;
const notes = [];
async function cmd(line) { const said = [], errors = []; await Commands.tryRun(line, agent, null, { say: (t) => said.push(String(t)), note: (t, o) => { said.push(String(t)); notes.push({ text: String(t), actions: (o?.actions || []).map((a) => a.label), run: o?.actions }); }, error: (t) => errors.push(String(t)) }); await wait(150); if (errors.length) throw Error(line + ' → ' + errors.join(' | ')); return said.join('\n'); }
const root = () => document.querySelector('.qj');
const disk = async () => (await window.hub.kvGet('quest-journal')) || {};
const opened = [];
const shotDir = window.SMOKE_TMP || window.SMOKE_SAVES;
// timers made by the walk code (by the stack)
const T = { n: 0 };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) { const orig = window[name]; if (!orig) continue; window[name] = function (...a) { if (/quest-walk/.test(new Error().stack || '')) T.n++; return orig.apply(this, a); }; }

try {
  // ---------- 1. a journal with the Paris guide on the map, two places already visited ----------
  await until(() => Lazy.isIn('questhud'), 'the tracker loads after the first screen');
  await Lazy.load('questjournal');
  const C = QuestCore, P = QuestParis;
  QuestWalk._test.open = (url) => { opened.push(url); };
  const seed = C.upgrade(C.initial()); P.addGuide(seed);
  for (const id of ['pp-denoyez', 'place-canal']) seed.atlas.places.find((p) => p.id === id).visitedAt = new Date().toISOString();
  await window.hub.kvSet('quest-journal', seed); await QuestHud.refresh();
  step('the walk code rides in the Studio\'s lazy group (nothing on the first screen)', typeof QuestWalk === 'object' && Lazy.isIn('questjournal'));
  // (round 64, mapfirst64) no command: the map itself has "Plan a walk" and the My walks chip
  activate('tool:quests'); await until(() => root() && QuestJournal.ready(), 'journal'); QuestJournal.navigate('world');
  await until(() => root().querySelector('.qmf-strip .qmf-plan'), 'Plan a walk on the map');
  step('the map shows Plan a walk and the My walks chip (on) with no command', !!root().querySelector('.qmf-chip[data-layer="walks"][aria-pressed="true"]') && /Plan a walk/.test(root().querySelector('.qmf-plan').textContent));

  // ---------- 2. /quest walk 11e → the walk, the line on the map, the chat answer ----------
  let said = await cmd('/quest walk 11e');
  await until(() => root()?.querySelector('.qj-atlas-route polyline'), 'the walk line on the map');
  const rt = QuestWalk.preview;
  step('/quest walk 11e: 3–5 stops in the 11e, none visited', rt && rt.stops.length >= 3 && rt.stops.length <= 5 && rt.stops.every((p) => P.byId(p.id)?.arr === 11) && !rt.stops.some((p) => ['pp-denoyez', 'place-canal'].includes(p.id)), rt?.stops.map((p) => p.name));
  step('inside 2 h, from a Métro to a Métro', rt.total <= 120 && rt.start.kind === 'metro' && rt.end.kind === 'metro', { total: Math.round(rt.total), start: rt.start.name, end: rt.end.name });
  step('the chat gets the walk: time, km, Métro, each stop', /km · about/.test(said) && /Start: Métro /.test(said) && /End: Métro /.test(said) && rt.stops.every((p) => said.includes(p.name)), said.slice(0, 200));
  const n = notes.at(-1);
  step('with Open walking route · Save as a walk quest · 3 h instead · Another area', ['Open walking route', 'Save as a walk quest', '3 h instead', 'Another area'].every((a) => n?.actions.includes(a)), n?.actions);
  const poly = root().querySelector('.qj-atlas-route polyline');
  step('the map shows a dotted line through start, stops and end, with numbered stops', poly.getAttribute('points').split(' ').length === rt.stops.length + 2 && root().querySelectorAll('.qj-route-stop').length === rt.stops.length && root().querySelector('.qj-route-stop text').textContent === '1');
  step('the Métro ends are pins on the map, and the map head has the walk icon', Boolean(root().querySelector('.qj-atlas-pin[data-place="walk-start"]') && root().querySelector('.qj-atlas-pin[data-place="walk-end"]')) && [...root().querySelectorAll('button')].some((b) => /Walk preview/.test(b.getAttribute('aria-label') || '')), { pins: [...root().querySelectorAll('.qj-atlas-pin')].filter((b) => !b.classList.contains('off-route')).map((b) => b.dataset.place), labels: [...root().querySelectorAll('button[aria-label*="alk"]')].map((b) => b.getAttribute('aria-label')) });
  await smoke({ shot: `${shotDir}/questwalk-map.png` });

  // ---------- 3. the walking link (Google Maps, waypoints, no key) ----------
  await n.run.find((a) => a.label === 'Open walking route').run();
  const g = new URL(opened.at(-1));
  step('Open walking route: Google Maps walking directions with every stop as a waypoint, no key', g.hostname === 'www.google.com' && g.searchParams.get('travelmode') === 'walking' && g.searchParams.get('waypoints').split('|').length === rt.stops.length && !/key=/.test(g.href), g.href.slice(0, 120));

  // ---------- 4. save → a walk campaign, followed by the ✦ tracker step by step ----------
  said = await cmd('/quest walk save');
  await until(async () => (await disk()).campaigns?.some((c) => /^c-walk-/.test(c.id)), 'walk saved on disk');
  let d = await disk();
  const camp = d.campaigns.find((c) => /^c-walk-/.test(c.id));
  let valid = true; try { C.validate(d); } catch { valid = false; }
  step('/quest walk save: a walk campaign Codex\'s rules accept, one step per stop, each with its place and a proof hint', valid && camp.quests.length === rt.stops.length && camp.quests.every((q, i) => q.place === rt.stops[i].id && q.proofHint.length > 20) && d.active === camp.id, camp.title);
  await QuestHud.refresh(); await until(() => QuestHud.state().current?.id === camp.quests[0].id, 'the tracker follows the walk');
  const chip = document.querySelector('#rail .qh-chip');
  step('the ✦ tracker follows it: stop 1 of N', QuestHud.state().current.title === camp.quests[0].title && (chip?.textContent || '').includes(`1/${camp.quests.length}`), chip?.textContent);
  await until(() => root()?.querySelector(`.qj-atlas-route polyline[data-route="${camp.id}"]`), 'the saved walk drawn');
  step('the saved walk stays on the map (its line, from the journal)', true);
  // the tracker moves to stop 2 once stop 1 is done (proof + review are the Studio's; recorded here directly)
  const s2 = C.clone(d); s2.records[camp.quests[0].id] = { startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  await QuestJournal.mutate((s) => { s.records = s2.records; }, 'check');
  await until(() => QuestHud.state().current?.id === camp.quests[1].id, 'stop 2');
  step('…and moves on to stop 2 once stop 1 is done', (document.querySelector('#rail .qh-chip')?.textContent || '').includes(`2/${camp.quests.length}`));

  // ---------- 5. the guide dialog: "Make a walk" beside its first button → the walk dialog, 3 h ----------
  QuestJournal.navigate('world'); await wait(200);
  [...root().querySelectorAll('.qj-field-footer button')].find((b) => b.textContent.trim() === 'Paris guide').click();
  await until(() => root().querySelector('dialog[open] .qw-make'), 'Make a walk in the guide dialog');
  const make = root().querySelector('dialog[open] .qw-make');
  step('"Make a walk" sits beside the guide\'s first button (same line, no new row)', make.parentElement.classList.contains('qj-actions') && make.parentElement.children.length === 2);
  make.click();
  await until(() => root().querySelector('dialog[open] .qw-stops'), 'the walk dialog');
  const items = root().querySelectorAll('dialog[open] .qw-stops li').length;
  step('the walk dialog lists start, 3–5 stops and the end', items >= 5 && items <= 7, items);
  await smoke({ shot: `${shotDir}/questwalk-dialog.png` });
  [...root().querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === '3 h instead').click();
  await until(() => QuestWalk.preview?.budget === 180 && root().querySelector('dialog[open] .qw-stops'), '3 h walk');
  step('3 h instead: a longer walk, still inside 3 h', QuestWalk.preview.total <= 180 && QuestWalk.preview.stops.length >= 3, Math.round(QuestWalk.preview.total));
  root().querySelector('dialog[open]').close(); await wait(100);

  // ---------- 6. the week plan proposes a walk on a free afternoon ----------
  await Lazy.load('weekquest');
  WeekQuest._test.shows = []; WeekQuest._test.weather = null;
  await cmd('/quest week');
  await until(() => document.querySelector('.wq-panel .wq-days'), 'the week card');
  const prop = WeekQuest.state().props.find((p) => p.kind === 'walk');
  step('/quest week proposes a walk on a free afternoon', Boolean(prop && /afternoon is free/.test(prop.why) && document.querySelector(`.wq-prop[data-prop="${prop.id}"]`)), prop && { title: prop.title, day: prop.day });
  document.querySelector(`.wq-prop[data-prop="${prop.id}"] .wq-accept`).click();
  await until(async () => (await disk()).weekly?.plans?.some((p) => p.items.some((x) => x.kind === 'walk')), 'walk planned');
  d = await disk();
  const item = d.weekly.plans.flatMap((p) => p.items).find((x) => x.kind === 'walk');
  step('Accept: the walk is planned on its day as a real walk quest', d.campaigns.some((c) => c.id === item.campaign && /^c-walk-/.test(c.id)) && item.day === prop.day);
  WeekQuest.close?.();

  // ---------- 7. idle ----------
  const t0 = T.n; await wait(1200);
  step('idle: the walk code runs no timers', T.n === t0, T.n - t0);
  step('nothing opened in the browser on its own (only the one click)', opened.length === 1);
  await QuestJournal.flush?.();
} catch (err) { step('the check ran to the end', false, String(err?.stack || err).slice(0, 400)); }
return JSON.stringify({ pass: !fails.length, errors: fails, ...out }, null, 1);
