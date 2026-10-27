// (round 71, studiohours71) 🎛 Studio hours in the real app, by CLICKING, on an isolated profile with FAKE sessions
// (kv 'music-sessions' written here, never the owner's) and a fixed clock (Tuesday 27 Oct 2026, 12:00 Paris):
//   node dev/smoke.js --fake-vst --script dev/checks/studiohours71.js --shot /tmp/studiohours71.png
// The ✦ chip → the tracker's panel has "This week: 2 h 35 making music" with a 7-day mini bar (the Sound desk is not
// loaded for it) → click → the card: this week by day, 8 week bars, the numbers (sessions, sketches saved, loops trimmed
// from a real loop card in <data>/creative-sketches, park sessions), longest session, Serum 2 vs Vital → Weekly goal: Off
// · Set one → 4 h: a soft ring + "New week, fresh start" (last week was under it; never a word about missing) → the
// row's ring → 2 h: "Goal reached ✓" → Off: no ring → Sessions in the Sound desk › opens the desk's Sessions → Sunday
// 18:00: one "You made music 3 times this week 🎛" (through the real focus path), never a second, never with none →
// no timers made, the sessions store never written, nothing sent anywhere.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [] }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const sent = []; const realFetch = window.fetch; window.fetch = (u, ...a) => { sent.push(String(u?.url || u)); return realFetch(u, ...a); };
const realOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { sent.push(String(u)); return realOpen.call(this, m, u, ...a); };
const shown = (n) => !!n && n.checkVisibility({ visibilityProperty: true });
const shot = async (name) => { if (window.SMOKE_TMP && typeof smoke === 'function') await smoke({ shot: `${window.SMOKE_TMP}/../studiohours71-${name}.png` }).catch(() => {}); };
const Z = (s) => Date.parse(s), iso = (t) => new Date(t).toISOString();
const row = (id, s, e, minutes, more = {}) => ({ id, start: iso(Z(s)), end: iso(Z(e)), minutes, used: { park: false, liveset: false, arrange: false }, instruments: ['Vital'], place: '', sketches: [], logged: null, ...more });

// ---------- fixtures: a quest journal (the tracker needs one), the fake sessions, one trimmed loop ----------
await Lazy.load('questcore'); await Lazy.load('questhud');
const QC = QuestCore; await hub.kvSet('quest-journal', QC.validate(QC.upgrade(QC.initial()))); await QuestHud.refresh();
const folder = (await hub.bouncelog.folder('Studio hours test')).path, SEP = navigator.platform.startsWith('Win') ? '\\' : '/';
const sketch = `${folder}${SEP}Sketch 2026-10-26 19.20.00.wav`, loopWav = `${folder}${SEP}Sketch 2026-10-26 19.20.00 loop 4 bars 120 BPM.wav`;
await hub.fs.write(sketch, 'RIFF fake'); await hub.fs.write(loopWav, 'RIFF fake');
await hub.fs.write(loopWav.replace(/\.wav$/, '.json'), JSON.stringify({ v: 1, kind: 'sketch-loop', id: 'sketchloop-t', at: '2026-10-26T20:10:00.000Z', loop: loopWav, from: sketch, start: 0, bpm: 120, bars: 4, beats: 4, seconds: 8, place: 'Sketch loop', sketch: 'Studio hours test', notes: 0 }));
const SESSIONS = { v: 1, sessions: [
  row('ses-mon', '2026-10-26T18:00:00Z', '2026-10-26T19:40:00Z', 95, { sketches: [{ path: sketch, at: '2026-10-26T19:20:00.000Z', seconds: 30 }] }),
  row('ses-cross', '2026-10-25T22:00:00Z', '2026-10-26T00:00:00Z', 120, { instruments: ['Serum 2'], used: { park: false, liveset: true, arrange: false } }), // Sun 23:00 → Mon 01:00 Paris
  row('ses-park', '2026-10-21T13:00:00Z', '2026-10-21T13:45:00Z', 40, { used: { park: true, liveset: false, arrange: false }, place: 'Buttes-Chaumont' }),
  row('ses-both', '2026-10-14T18:00:00Z', '2026-10-14T20:00:00Z', 100, { instruments: ['Serum 2', 'Vital'] }),
] };
await hub.kvSet('music-sessions', SESSIONS);
const kv0 = JSON.stringify((await hub.kvGet('music-sessions', null)));
// timers: every interval / timeout Studio hours' own files make DIRECTLY from here on (a toast's own auto-hide, which a click asked for, is the toast's)
const made = []; const realSI = window.setInterval, realST = window.setTimeout, direct = () => /studiohours/.test((new Error().stack || '').split('\n')[3] || '');
window.setInterval = function (...a) { if (direct()) made.push('interval'); return realSI.apply(this, a); };
window.setTimeout = function (...a) { if (direct()) made.push('timeout'); return realST.apply(this, a); };
const creativeBefore = Lazy.loaded('creative');
try { localStorage.removeItem('studiohours.prefs'); localStorage.removeItem('studiohours.sunday'); } catch { /* fresh profile */ }
await Lazy.load('studiohours'); StudioHours._test.clock(() => Z('2026-10-27T11:00:00Z'));

// 1. the ✦ chip → the tracker → the row
const chip = await until(() => { const c = document.querySelector('#rail .qh-chip'); return shown(c) && c; }, 15000, 'the ✦ chip');
chip.click();
const hudRow = await until(() => document.querySelector('.qh-panel .sh-hud'), 8000, 'the Studio hours row in the tracker');
ok(shown(hudRow) && hudRow.querySelector('.qh-row-title').textContent === 'This week: 2 h 35 making music', `the tracker says "${hudRow.querySelector('.qh-row-title').textContent}" (Monday's 95 min + the hour after midnight of Sunday's session)`);
ok(hudRow.querySelector('.qh-sub').textContent === 'Studio hours ›', 'its label in words: "Studio hours ›"');
const minis = [...hudRow.querySelectorAll('.sh-mini i')];
ok(minis.length === 7 && minis[0].style.height === '100%' && minis[1].classList.contains('today') && minis[1].classList.contains('zero') && minis.slice(2).every((i) => i.classList.contains('later')), 'a 7-day mini bar: Monday full, Tuesday today (nothing yet), the rest later');
ok(/This week: 2 h 35 making music/.test(hudRow.getAttribute('aria-label')), 'the row is named for screen readers');
ok(Lazy.loaded('creative') === creativeBefore, 'the Sound desk was not loaded to show the row');
await shot('row');

// 2. click → the card
hudRow.click();
const card = await until(() => document.querySelector('.sh-panel .sh-stats') && document.querySelector('.sh-panel'), 8000, 'the Studio hours card');
ok(!document.querySelector('.qh-panel:not(.sh-panel)'), 'the tracker closed for the card');
ok(card.querySelector('.sh-total').textContent === '2 h 35' && /2 h 35/.test(card.querySelector('.sh-top').textContent) && /1 session/.test(card.querySelector('.sh-top').textContent), 'this week: "2 h 35 · making music this week · 1 session"');
ok(card.querySelectorAll('.sh-days .sh-col').length === 7 && card.querySelectorAll('.sh-weeks .sh-col').length === 8, '7 day bars and 8 week bars');
const weekLabs = [...card.querySelectorAll('.sh-weeks .sh-lab')].map((x) => x.textContent);
ok(weekLabs[0] === '7 Sep' && weekLabs[7] === '26 Oct' && card.querySelector('.sh-weeks .sh-col.now .sh-lab').textContent === '26 Oct', `weeks Monday-labelled, oldest first: ${weekLabs.join(' · ')}`);
ok(/Week of 26 Oct/.test(card.querySelector('.qh-head').textContent), 'the head: "Week of 26 Oct"');
const cells = [...card.querySelectorAll('.sh-stats > *')].map((x) => x.textContent);
const statOf = (name) => { const i = cells.indexOf(name); return [cells[i + 1], cells[i + 2]]; };
ok(JSON.stringify(statOf("Time")) === '["2 h 35","5 h 55"]', `time: this week ${statOf('Time')[0]}, 8 weeks ${statOf('Time')[1]}`);
ok(JSON.stringify(statOf('Sessions')) === '["1","4"]', 'sessions: 1 this week (Sunday night belongs to last week), 4 in 8 weeks');
ok(JSON.stringify(statOf('Sketches saved')) === '["1","1"]', 'sketches saved: 1');
ok(JSON.stringify(statOf('Loops trimmed')) === '["1","1"]', 'loops trimmed: 1 (the real loop card in the sketches folder)');
ok(JSON.stringify(statOf('Park sessions')) === '["0","1"]', 'park sessions: 0 this week, 1 in 8 weeks');
const facts = card.querySelector('.sh-facts').textContent;
ok(/Longest session2 h · Sun 25 Oct/.test(facts), 'longest session: 2 h · Sun 25 Oct');
ok(/Most usedVital 3 h 05 · Serum 2 2 h 50/.test(facts), `most used: ${card.querySelector('.sh-inst').textContent}`);
ok(!card.querySelector('.sh-ring'), 'no goal by default: no ring');
await shot('card');

// 3. the weekly goal, by clicking
const click = async (re) => { const b = await until(() => [...(document.querySelector(".sh-panel") || card).querySelectorAll("button")].find((x) => re.test(x.textContent.trim()) && shown(x)), 5000, String(re)); b.click(); await wait(30); return b; };
await click(/^Off · Set one$/);
const chips = [...card.querySelectorAll('.sh-chip')].map((b) => b.textContent);
ok(chips.join('|') === 'Off|2 h|3 h|4 h|6 h', `goal chips: ${chips.join(' · ')}`);
await click(/^4 h$/);
ok(card.querySelector('.sh-big-ring .sh-ring') && card.querySelector('.sh-goal-line').textContent === 'New week, fresh start', 'a 4 h goal: a soft ring, and after a week under it only "New week, fresh start"');
ok(!/miss|fail|behind|should/i.test(card.textContent), 'no word about missing, anywhere on the card');
const dash = card.querySelector('.sh-big-ring .sh-ring-fg').getAttribute('stroke-dasharray').split(' ').map(Number);
ok(Math.abs(dash[0] / dash[1] - 155 / 240) < 0.01, 'the ring holds this week’s share (2 h 35 of 4 h)');
ok(/4 h · Change/.test(card.querySelector('.sh-goal-btn').textContent), 'the goal button says "4 h · Change"');
await shot('goal');
document.querySelector('.sh-panel .qh-head .qh-icon').click(); ok(!document.querySelector('.sh-panel'), '× closes the card');
chip.click(); const r2 = await until(() => document.querySelector('.qh-panel .sh-hud .sh-ring'), 5000, 'the ring in the tracker row');
ok(/New week, fresh start/.test(document.querySelector('.qh-panel .sh-hud .qh-sub').textContent), 'the row shows the soft ring: "Studio hours › · New week, fresh start"');
document.querySelector('.qh-panel .sh-hud').click(); await until(() => document.querySelector('.sh-panel .sh-stats'), 5000, 'card again');
await click(/^4 h · Change$/); await click(/^2 h$/);
ok(document.querySelector('.sh-goal-line').textContent === 'Goal reached ✓ · 2 h this week' && document.querySelector('.sh-goal-line').classList.contains('on'), 'a 2 h goal: "Goal reached ✓ · 2 h this week"');
await click(/^2 h · Change$/); await click(/^Off$/);
ok(!document.querySelector('.sh-panel .sh-ring') && /Off · Set one/.test(document.querySelector('.sh-goal-btn').textContent), 'Off: the ring goes away');

// 4. Sessions in the Sound desk ›
const runtime = await hub.vst.status().catch(() => ({}));
if (runtime.ok) {
  // the owner's desk has an instrument: a fake 'Vital' (the fake host plays a sine), as bouncelog66 sets it up
  const vdir = `${window.SMOKE_TMP}/studiohours71`; await hub.fs.write(`${vdir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
  await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [vdir]; project.title = 'Studio hours test'; await hub.kvSet('creative-workbenches', project);
  await click(/^Sessions in the Sound desk ›$/);
  await until(() => document.querySelector('.bl-panel'), 20000, 'the Sound desk’s Sessions');
  ok(!document.querySelector('.sh-panel') && /Sound desk|session/i.test(document.querySelector('.bl-panel').getAttribute('aria-label')), '“Sessions in the Sound desk ›” opens the desk with its Sessions list');
  activate?.('chat');
} else { (out.skipped = out.skipped || []).push('Sessions in the Sound desk ›: no instrument runtime here'); StudioHours.close(); }

// 5. Sunday evening: one kind note, through the real "Hearth came to the front" path
const SUN = Z('2026-10-25T17:30:00Z'); // Sunday 25 Oct, 18:30 Paris
await hub.kvSet('music-sessions', { v: 1, sessions: [row('s1', '2026-10-19T18:00:00Z', '2026-10-19T19:00:00Z', 50), row('s2', '2026-10-22T18:00:00Z', '2026-10-22T19:00:00Z', 30), row('s3', '2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z', 40)] });
const toastText = () => [...document.querySelectorAll('#toasts .toast, .toast')].map((t) => t.textContent).join(' | ');
StudioHours._test.clock(() => SUN); WeekNudge._test.clock(() => SUN);
dispatchEvent(new Event('focus'));
await until(() => /You made music 3 times this week 🎛/.test(toastText()), 15000, 'the Sunday note');
ok(true, `Sunday 18:30 Paris, Hearth comes to the front: "${toastText().match(/You made music[^|]*/)[0].trim()}"`);
ok([...document.querySelectorAll('.toast')].some((t) => /Studio hours/.test(t.textContent)), 'the note has a "Studio hours" button');
document.querySelectorAll('.toast').forEach((t) => t.remove());
ok((await StudioHours.sunday()) === null, 'at most one: asked again that evening → nothing');
dispatchEvent(new Event('focus')); await wait(400); ok(!/You made music/.test(toastText()), 'coming back to the front again: no second note');
const SUN2 = Z('2026-11-01T18:00:00Z'); // the next Sunday, 19:00 Paris: no session that week
StudioHours._test.clock(() => SUN2); WeekNudge._test.clock(() => SUN2);
ok((await StudioHours.sunday()) === null, 'a week with no music: never a note');
dispatchEvent(new Event('focus')); await wait(400); ok(!/You made music/.test(toastText()), '…not on coming to the front either');
WeekNudge._test.clock(null); StudioHours._test.clock(null);

// 6. calm and safe
ok(!made.length, `no timers made by Studio hours (${made.join(', ') || 'none'})`);
await hub.kvSet('music-sessions', SESSIONS); // (5. wrote its own fixture; put the first back to compare)
ok(JSON.stringify(await hub.kvGet('music-sessions', null)) === kv0, 'the sessions store is only read');
ok(!sent.length, 'nothing sent anywhere: ' + (sent.join(', ') || 'no requests'));
window.setInterval = realSI; window.setTimeout = realST;
return JSON.stringify(out);
